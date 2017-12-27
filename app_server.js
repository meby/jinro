'use strict';

const request = require('request');
const meby = require('./meby');
const Villager = require('./villager.js');
const Statement = require('./statement.js');

const HTTP_PORT = 8080;
const TCP_PORT = 3030;

// app data
let usernames;                  // 部屋にいるユーザーリスト (プレイに参加してない観戦者を含む)
let joinUsernames;              // 参加希望ユーザー

let state;                      // 'title', 'looking', 'game'
let playing;                    // ゲーム中かどうか
let gameResult;                 // ゲーム結果
let villagers;                  // 村人たち
let days;                       // 何日目か (１から始まる)
let hours;                      // 時間帯 'prologue', 'morning', 'day', 'evening', 'night', 'epilogue'
let hangIdx;                    // 処刑されたキャラクター
let log;

// option
let requiredNumPeople;          // 募集人数(必要人数)
let staffRoleStyle;             // 終了後のユーザーネーム表示 0..非表示 1..表示
let entryDuration;              // 村人募集時間 (秒)
let morningDuration;            // 朝の時間 (秒)
let dayDuration;                // 昼の時間 (秒)
let eveningDuration;            // 夕の時間 (秒)
let nightDuration;              // 夜の時間 (秒)
let epilogueDuration;           // 最終日 (秒)
let showVotes;                  // 投票内容を表示するか
let showEndRole;                // ゲーム終了時にエンドロールを表示するか

const MAX_NUM_CHARAS = 43;

let timeout = null;
let hoursStartTime;             // 現在の時間帯の開始時刻
let joinStartTime;              // 募集の開始時刻
const HOURS_INTERVAL = 1;       // 時間帯と時間帯の間の時間 (秒)

const STATE_TITLE   = 'title';
const STATE_LOOKING = 'looking';
const STATE_GAME    = 'game';

const HOURS_PROLOGUE  = 'prologue';
const HOURS_MORNING   = 'morning';
const HOURS_DAY       = 'day';
const HOURS_EVENING   = 'evening';
const HOURS_NIGHT     = 'night';
const HOURS_EPILOGUE  = 'epilogue';
const HOURS_GAME_DONE = 'game_done';

const HUMAN     = 'human';      // 人間
const SEER      = 'seer';       // 占い師
const MEDIUM    = 'medium';     // 霊能者
const BODYGUARD = 'bodyguard';  // 狩人
const CO_OWNER  = 'co_owner';   // 共有者
const JINRO     = 'jinro';      // 人狼
const MAD_MAN   = 'mad_man';    // 狂人
const FOX       = 'fox';        // 妖狐

const RESULT_CONTINUE      = 'continue';
const RESULT_VILLAGERS_WIN = 'villagers_win';
const RESULT_WOLVES_WIN    = 'wolves_win';
const RESULT_FOX_WIN       = 'fox_win';

function initGame() {
    joinUsernames = [];

    state = STATE_TITLE;
    playing = false;
    gameResult = RESULT_CONTINUE;
    villagers = [];
    showVotes = true;
    showEndRole = true;
    log = [];
}

// 登場人物のキャラクターとロールを決める
function setupCharacsAndRoles(joinUsernames) {
    // 参加人数
    let n = joinUsernames.length;

    // ロール
    let roles = [];

    // 能力者追加
    const CONDS = [
        [2, SEER],              // 2 人以上で占い師登場
        [2, JINRO],             // 2 人以上で人狼登場
        [8, JINRO],             // 8 人以上でさらに人狼登場
        [15, JINRO],            // 15 人以上でさらに人狼登場
        [9, MEDIUM],            // 9 人以上で霊能者登場
        [10, MAD_MAN],          // 10 人以上で狂人登場
        [11, BODYGUARD],        // 11 人以上で狩人登場
        [14, FOX],              // 14 人以上で妖狐登場
        [16, CO_OWNER],         // 16 人以上で共有者登場
        [16, CO_OWNER]          // 16 人以上で共有者登場
    ];

    for (let cond of CONDS) {
        if (n >= cond[0]) {
            roles.push(cond[1]);
        }
    }
    
    // ただの人間追加
    while (roles.length < n) {
        roles.push(HUMAN);
    }

    // ロールシャッフル
    for (let i = 0; i < n; i++) {
        let j = Math.floor(Math.random() * n);
        [roles[i], roles[j]] = [roles[j], roles[i]];
    }

    // キャラシャッフル
    let charas = [];
    for (let i = 0; i < MAX_NUM_CHARAS; i++) {
        charas[i] = i;
    }
    for (let i = 0; i < charas.length; i++) {
        let j = Math.floor(Math.random() * charas.length);
        [charas[i], charas[j]] = [charas[j], charas[i]];
    }

    // 参加者をシャッフルする
    for (let i = 0; i < joinUsernames.length; i++) {
        let j = Math.floor(Math.random() * (joinUsernames.length));
        [joinUsernames[i], joinUsernames[j]] = [joinUsernames[j], joinUsernames[i]];
    }
    
    // 村人生成
    villagers = [];
    for (let i = 0; i < n; i++) {
        let villager = new Villager(i, joinUsernames[i], charas[i], roles[i]);
        villagers.push(villager);
    }
}

// 村人全員に送信
function sendToVillagers(line) {
    for (let villager of villagers) {
        meby.send(villager.username, line);
    }
}

// 狼へ送信
function sendToWolves(line) {
    let wolves = villagers.filter(
        (v) => v.role == JINRO
    );

    for (let villager of wolves) {
        meby.send(villager.username, line);
    }
}

// 犠牲者へ送信
function sendToVictims(line) {
    let victims = villagers.filter(
        (v) => v.alive == false
    );

    for (let villager of victims) {
        meby.send(villager.username, line);
    }
}

// このアプリ内での通常ログ用メッセージ
function sendMessage(line) {
    sendToVillagers('jmsg ' + line)

    log.push(new Statement('jmsg', -1, 'ALL', line));
}

function getDuration(hours) {
    let duration = -1;

    if (hours == HOURS_PROLOGUE) {
        duration = 10;
    }
    if (hours == HOURS_MORNING) {
        duration = morningDuration;
    }
    if (hours == HOURS_DAY) {
        duration = dayDuration;
    }
    if (hours == HOURS_EVENING) {
        duration = eveningDuration;
    }
    if (hours == HOURS_NIGHT) {
        duration = nightDuration;
    }
    if (hours == HOURS_EPILOGUE) {
        duration = epilogueDuration;
    }

    return duration;
}

const CMD_FUNCS = {
    'loaded': cmdLoaded,

    'say': cmdSay,         // 村人の発言
    'howl': cmdHowl,       // 人狼の発言
    'groan': cmdGroan,     // 離脱者の発言

    'vote': cmdVote,       // 吊り投票
    'hunt': cmdHunt,       // 狩る投票
    'divine': cmdDivine,   // 占う指定
    'guard': cmdGuard,     // 守る指定

    'skip': cmdSkip,       // スキップ要求

    'make_village': cmdMakeVillage, // 村を作る
    'join': cmdJoin,                // 参加する
    'reset': cmdReset,              // ゲームリセット

    'start_village': cmdStartVillage,
    'next_hours': cmdNextHours
}

// dispatch messages from app clients for each command
function onMsg(username, sid, msg) {
    let ary = meby.split(msg, ' ', 2);
    let cmd = ary[0];
    let line = ary[1];
 
    let func = CMD_FUNCS[cmd];
    if (func != null) {
        func(username, sid, line);
    }
}
 
function cmdLoaded(username, sid, line) {
    // タイトル
    if (state == STATE_TITLE) {
        meby.sendBySid(sid, 'playing false');
    }

    // 募集中
    if (state == STATE_LOOKING) {
        let joined = joinUsernames.indexOf(username) != -1 ? true : false;
        meby.sendBySid(sid, 'joined ' + joined);
        meby.sendBySid(sid, 'join_info ' + joinUsernames.length);

        // 募集の残り時間を伝える
        let elapsedTime = ((new Date).getTime() - joinStartTime) / 1000;
        let rest = entryDuration - elapsedTime;
        meby.sendBySid(sid, 'looking_start ' + rest);

        return;
    }

    // プレイ中
    if (state == STATE_GAME) {
        // プレイヤーか
        let selfVillager = villagers.find(
            (v) => v.username == username
        );
        if (selfVillager == null) {
            meby.sendBySid(sid, 'playing true');
            meby.sendBySid(sid, 'screen title');

            return;
        }

        // 村人を伝える
        let charas = villagers.map((v) => v.chara + ':' + v.name());
        meby.sendBySid(sid, 'villager_list ' + villagers.length + ' ' + charas.join(' '));
        for (let villager of villagers) {
            meby.sendBySid(sid, 'villager_state ' + villager.idx + ' ' + villager.alive);
        }

        // プレイヤー自身のキャラを伝える
        meby.sendBySid(sid, 'self_data ' + selfVillager.idx + ' ' + selfVillager.chara + ' ' + selfVillager.role);

        // いまの日時を伝える
        meby.sendBySid(sid, 'day_info ' + days + ' ' + hours);

        // 残り時間を伝える
        let elapsedTime = ((new Date).getTime() - hoursStartTime) / 1000;
        let duration = getDuration(hours);
        meby.sendBySid(sid, 'timer_start ' + duration + ' ' + elapsedTime);

        // ログ
        for (let statement of log) {
            meby.sendBySid(sid, statement.toString());
        }

        // ターゲットモード
        if (selfVillager != null) {
            sendToVillagers('target_mode_switch clear');
            if (hours == HOURS_DAY) {
                if (days >= 2) {
                    if (selfVillager.alive == true) {
                        sendToVillagers('target_mode_switch vote');
                    }
                }
            }

            if (hours == HOURS_NIGHT) {
                if (selfVillager.alive == true) {
                    if (selfVillager.role == JINRO) {
                        sendToVillagers('target_mode_switch hunt');
                    }
                    if (selfVillager.role == SEER) {
                        sendToVillagers('target_mode_switch divine');
                    }
                    if (selfVillager.role == BODYGUARD) {
                        sendToVillagers('target_mode_switch guard');
                    }
                }
            }

            // 投票・指定を伝える
            if (selfVillager != null) {
                if (selfVillager.vote != -1) {
                    meby.sendBySid(sid, 'vote_target ' + selfVillager.vote);
                }
                if (selfVillager.hunt != -1) {
                    meby.sendBySid(sid, 'hunt_target ' + selfVillager.hunt);
                }
                if (selfVillager.divine != -1) {
                    meby.sendBySid(sid, 'divine_target ' + selfVillager.divine);
                }
                if (selfVillager.guard != -1) {
                    meby.sendBySid(sid, 'guard_target ' + selfVillager.guard);
                }
            }
        }
    }

    meby.sendBySid(sid, 'screen ' + state);
}

// 村人の発言
function cmdSay(username, sid, line) {
    // 昼であること
    if (hours != HOURS_DAY) {
        return;
    }

    // 村人 (生きていること)
    let villager = villagers.find(
        (v) => v.username == username
            && v.alive == true
    );
    if (villager == null) {
        return;
    }

    // 村人の発言
    sendToVillagers('say ' + villager.idx + ' ' + line);
    log.push(new Statement('say', villager.idx, 'ALL', line));
}

// 人狼間の発言 (遠吠え)
function cmdHowl(username, sid, line) {
    // 昼か夜じゃなけば遠吠はできない
    if (!(hours == HOURS_DAY || hours == HOURS_NIGHT)) {
        return;
    }

    // 発言する村人 (人狼であること, 生きていること)
    let villager = villagers.find(
        (v) => v.username == username
            && v.role == JINRO
            && v.alive == true
    );
    if (villager == null) {
        return;
    }

    // 人狼だけに伝える
    sendToWolves('howl ' + villager.idx + ' ' + line);
    log.push(new Statement('howl', villager.idx, 'WOLVES', line));
}

// 離脱者間の発言 (うめき)
function cmdGroan(username, sid, line) {
    // 昼か夜じゃないとうめくことはできない
    if (!(hours == HOURS_DAY || hours == HOURS_NIGHT)) {
        return;
    }

    // 発言する村人 (離脱していること)
    let villager = villagers.find(
        (v) => v.username == username
            && v.alive == false
    );
    if (villager == null) {
        return; 
    }

    // 離脱してる人だけに伝える
    sendToVictims('groan ' + villager.idx + ' ' + line);
    log.push(new Statement('groan', villager.idx, 'VICTIMS', line));
}

// 吊るしの投票する
function cmdVote(username, sid, line) {
    // 昼であること
    if (hours != HOURS_DAY) {
        return;
    }

    // 投票される村人
    let targetIdx = parseInt(line);

    // 投票者
    let voter = villagers.find(
        (v) => v.username == username
            && v.alive == true
    );
    if (voter == null) {
        return; 
    }

    // まだ投票してないこと
    if (voter.vote != -1) {
        return;
    }

    // ターゲットとなる村人
    let target = villagers.find(
        (v) => v.idx == targetIdx
            && v.alive == true
    );
    if (target == null) {
        return;
    }

    // ターゲットとなる村人を設定する
    voter.vote = target.idx;
    meby.send(username, 'vote_target ' + target.idx);
}

// 狩りの投票する
function cmdHunt(username, sid, line) {
    // 夜であること
    if (hours != HOURS_NIGHT) {
        return;
    }

    // 投票される人
    let targetIdx = parseInt(line);

    // 人狼 (生きていること)
    let wolf = villagers.find(
        (v) => v.username == username
            && v.role == JINRO
            && v.alive == true
    );
    if (wolf == null) {
        return;
    }

    // まだ投票してないこと
    if (wolf.hunt != -1) {
        return;
    }

    // ターゲットとなる村人 (生きていること)
    let target = villagers.find(
        (v) => v.idx == targetIdx
            && v.alive == true
    );
    if (target == null) {
        return;
    }

    // ターゲットとなる村人を設定する
    wolf.hunt = target.idx;
    meby.send(username, 'hunt_target ' + target.idx);
}

// 占いの指定をする
function cmdDivine(username, sid, line) {
    // 夜であること
    if (hours != HOURS_NIGHT) {
        return;
    }

    // 占われる人
    let targetIdx = parseInt(line);

    // 占う行為をした村人 (占い師であること, 生きていること)
    let seer = villagers.find(
        (v) => v.username == username
            && v.role == SEER
            && v.alive == true
    );
    if (seer == null) {
        return;
    }

    // まだ指定してないこと
    if (seer.divine != -1) {
        return;
    }

    // 占われる対象の村人 (生きていること)
    let target = villagers.find(
        (v) => v.idx == targetIdx
            && v.alive == true
    );
    if (target == null) {
        return;
    }

    // 占い対象を設定
    seer.divine = target.idx;
    meby.send(username, 'divine_target ' + target.idx);
}

// 守りの指定をする
function cmdGuard(username, sid, line) {
    // 夜であること
    if (hours != HOURS_NIGHT) {
        return;
    }

    // 守られる人
    let targetIdx = parseInt(line);

    // 守護者
    let hunter = villagers.find(
        (v) => v.username == username
            && v.role == BODYGUARD
    );
    if (hunter == null) {
        return;
    }

    // まだ指定してないこと
    if (hunter.guard != -1) {
        return;
    }

    // 守られる村人
    let target = villagers.find(
        (v) => v.idx == targetIdx
            && v.alive == true
    );
    if (target == null) {
        return;
    }

    // 守る対象を設定
    hunter.guard = target.idx;
    meby.send(username, 'guard_target ' + target.idx);
}

// スキップ要求
function cmdSkip(username, sid, line) {
    // 村人 (生きていること, まだスキップ要求をしていないこと)
    let villager = villagers.find(
        (v) => v.username == username
            && v.alive == true
            && v.skip == false
    );
    if (villager == null) {
        return;
    }

    villager.skip = true;

    // スキップを押している人の数を数える
    let numAlives = 0;
    let numSkips = 0;
    for (let v of villagers) {
        if (v.alive == true) {
            numAlives++;
        }
        if (v.alive == true && v.skip == true) {
            numSkips++;
        }
    }

    sendToVillagers('skip_info ' + numSkips + ' ' + numAlives);

    // 生きている人全員がスキップを要求しているならば次の時間帯へスキップ
    if (numAlives == numSkips && numSkips > 0) {
        // 設定されてるタイマーをリセットし新たにセットする
        if (timeout != null) {
            clearTimeout(timeout);
        }
        timeout = setTimeout(function() {
            onMsg(null, null, 'next_hours');
        }, 1);
    }
}

// 村を作る
function cmdMakeVillage(username, sid, line) {
    if (playing == true) {
        return;
    }

    let ary = line.split(' ');
    requiredNumPeople = parseInt(ary[0]);
    entryDuration    = parseInt(ary[1]);
    morningDuration  = parseInt(ary[2]);
    dayDuration      = parseInt(ary[3]);
    eveningDuration  = parseInt(ary[4]);
    nightDuration    = parseInt(ary[5]);
    epilogueDuration = parseInt(ary[6]);
    showEndRole      = ary[7] == 'true' ? true : false;

    if (requiredNumPeople < 8) {
        requiredNumPeople = 8;
    }
    if (entryDuration < 1) {
        entryDuration = 1;
    }
    if (morningDuration < 1) {
        morningDuration = 1;
    }
    if (dayDuration < 1) {
        dayDuration = 1;
    }
    if (eveningDuration < 1) {
        eveningDuration = 1;
    }
    if (nightDuration < 1) {
        nightDuration = 1;
    }
    if (epilogueDuration < 1) {
        epilogueDuration = 1;
    }

    state = STATE_LOOKING;
    playing = true;

    hangIdx = -1;
    joinUsernames = [];

    // 村開始タイマー
    timeout = setTimeout(function() {
        onMsg(null, null, 'start_village');
    }, entryDuration * 1000);

    joinStartTime = (new Date()).getTime();

    // 募集画面
    meby.sendAll('looking_start ' + entryDuration);
    meby.sendAll('screen ' + state);
    meby.sendLog(username + 'が村人の募集を始めました。');
}

// ゲームに参加する
function cmdJoin(username, sid, line) {
    // 募集中か
    if (state != STATE_LOOKING) {
        return;
    }

    if (joinUsernames.indexOf(username) != -1) {
        return;
    }

    if (joinUsernames.length >= MAX_NUM_CHARAS) {
        return;
    }

    joinUsernames.push(username);

    meby.send(username, 'joined true');
    meby.sendAll('join_info ' + joinUsernames.length);
}

function cmdReset(username, sid, line) {
    sweepVillage();
    meby.sendLog(username  + 'がリセットしました。');

    meby.sendStatus('false');
}

// ゲーム開始 (タイマーによる)
function cmdStartVillage(username, sid, line) {
    // タイマー完了
    if (timeout != null) {
        timeout = null;
    }

    meby.sendLog('開始時刻になりました。');
    meby.sendLog('必要人数 : ' + requiredNumPeople + '人');
    meby.sendLog('参加人数 : ' + joinUsernames.length + '人');

    // 開始条件
    if (joinUsernames.length < requiredNumPeople) {
        sweepVillage();
        meby.sendLog('ゲームは始まりませんでした。');
        return;
    }

    // 村に登場するキャラクターと役割を決定し、村人リストを生成
    setupCharacsAndRoles(joinUsernames);
    
    // 村開始
    state = STATE_GAME;
    playing = true;
    gameResult = RESULT_CONTINUE;
    days = 0;
    hours = null;
    log = [];

    meby.sendStatus('true');

    // ゲーム画面へ
    meby.sendLog('参加人数が必要人数に達しました。ゲームを開始します。');
    sendToVillagers('game_start');

    for (let username of usernames) {
        let villager = villagers.find(
            (v) => v.username == username
        );
        if (villager != null) {
            meby.send(username, 'screen ' + STATE_GAME);
        } else {
            meby.send(username, 'screen ' + STATE_TITLE);
        }
    }

    // 村人を伝える
    let charas = villagers.map((v) => v.chara + ':' + v.name());
    sendToVillagers('villager_list ' + villagers.length + ' ' + charas.join(' '));
    for (let villager of villagers) {
        sendToVillagers('villager_state ' + villager.idx + ' ' + villager.alive);
    }

    // それぞれのプレイヤーに自身のキャラを伝える
    for (let villager of villagers) {
        meby.send(villager.username, 'self_data ' + villager.idx + ' ' + villager.chara + ' ' + villager.role);
    }

    // 共有者リスト
    let kyoyuVillagers = villagers.filter(
        (v) => v.role == CO_OWNER
    );

    // 共有者を通知する
    for (let villager1 of kyoyuVillagers) {
        for (let villager2 of kyoyuVillagers) {
            if (villager2.idx != villager1.idx) {
                meby.send(villager1.username, 'jmsg ' + villager2.name() + 'は共有者です。');
            }
        }
    }

    // 次の時間帯へ
    timeout = setTimeout(function() {
        onMsg(null, null, 'next_hours');
    }, 1);
}

// 時間帯を進める
function getNextHours(days, hours, nightDuration) {
    if (gameResult != RESULT_CONTINUE) {
        if (hours == HOURS_MORNING || hours == HOURS_EVENING) {
            hours = HOURS_EPILOGUE;
            return [days, hours];
        }
        if (hours == HOURS_EPILOGUE) {
            hours = HOURS_GAME_DONE;
            return [days, hours];
        }
    }

    if (hours == null) {
        days = 0;
        hours = HOURS_PROLOGUE;
        return [days, hours];
    }

    if (hours == HOURS_PROLOGUE) {
        days = 1;
        hours = HOURS_DAY;
        return [days, hours];
    }

    if (hours == HOURS_MORNING) {
        hours = HOURS_DAY;
        return [days, hours];
    }

    if (hours == HOURS_DAY) {
        // 初日は夕方をスキップ
        if (days == 1) {
            if (nightDuration > 0) {
                hours = HOURS_NIGHT;
            } else {
                days = 2;
                hours = HOURS_MORNING;
            }
        } else {
            hours = HOURS_EVENING;
        }
        return [days, hours];
    }

    if (hours == HOURS_EVENING) {
        if (nightDuration > 0) {
            hours = HOURS_NIGHT;
        } else {
            days++;
            hours = HOURS_MORNING;
        }
        return [days, hours];
    }

    if (hours == HOURS_NIGHT) {
        days++;
        hours = HOURS_MORNING;
        return [days, hours];
    }

    if (hours == HOURS_EPILOGUE) {
        hours = HOURS_GAME_DONE;
        return [days, hours];
    }

    return null;
}

function prologuePhase() {
    sendMessage('プレイヤーはそれぞれが村人と村人に化けた人狼となり、');
    sendMessage('自身の正体を隠し欺いたりしながら他のプレイヤーと交渉して相手の正体を探る。');
    sendMessage('');
    sendMessage('ゲームは半日単位で進行し、昼には全プレイヤーの投票により決まった人狼容疑者1名の処刑が、');
    sendMessage('夜には人狼による村人の襲撃が行われる。');
    sendMessage('');
    sendMessage('全ての人狼を処刑することができれば村人チームの勝ち、');
    sendMessage('生き残った人狼と同数まで村人を減らすことができれば人狼チームの勝ちとなる。');
}

function morningPhase() {
    sendToVillagers('target_mode_switch clear');

    let huntedVillager = null;
    let divinedVillager = null;
    
    // 狩り
    if (days >= 3) {
        huntedVillager = executeHunt();
    }
    
    // 人狼と妖狐の勝利判定
    gameResult = judgeByWerewolf();
    if (gameResult != RESULT_CONTINUE) {
        // 狩り結果表示
        if (huntedVillager != null) {
            sendMessage(huntedVillager.name() + 'が無残な姿で発見されました。');
            sendMessage('');
        }
        
        // ゲーム終了, 結果報告
        playing = false;

        sendMessage('村人が人狼と同数以下になってしまいました。');
        sendMessage('');
        if (gameResult == RESULT_WOLVES_WIN) {
            sendMessage('人狼が勝利をおさめました。');
        }
        if (gameResult == RESULT_FOX_WIN) {
            sendMessage('しかし、妖狐は生き残っていました。');
            sendMessage('');
            sendMessage('妖狐が勝利をおさめました。');
        }
    } else {
        // ゲーム続行
        
        // 占い
        if (days >= 2) {
            divinedVillager = executeDivine();
        }
        
        // 狩り・呪殺結果表示
        if (Math.floor(Math.random() * 2) == 0) {
            if (divinedVillager != null) {
                sendMessage(divinedVillager.name() + 'が占われました。');
            }
            if (huntedVillager != null) {
                sendMessage(huntedVillager.name() + 'が無残な姿で発見されました。');
            }
        } else {
            if (huntedVillager != null) {
                sendMessage(huntedVillager.name() + 'が無残な姿で発見されました。');
            }
            if (divinedVillager != null) {
                sendMessage(divinedVillager.name() + 'が占われました。');
            }
        }
        
        // 霊能
        if (days >= 3) {
            executeSpiritual();
        }
    }
}

function dayPhase() {
    // 投票リセット
    for (let villager of villagers) {
        villager.vote = -1;
    }
    
    // 投票モード
    sendToVillagers('target_mode_switch clear');
    if (days >= 2) {
        villagers.filter(
            (v) => v.alive == true
        ).forEach(
            (v) => meby.send(v.username, 'target_mode_switch vote')
        );
    }
}

function eveningPhase() {
    // ターゲットモード
    sendToVillagers('target_mode_switch clear');

    // 吊り
    hangIdx = -1;
    if (days >= 2) {
        executeHang();
    }
    
    // 人間・妖狐の勝利条件チェック
    gameResult = judgeByVillagers();
    if (gameResult != RESULT_CONTINUE) {
        playing = false;

        sendMessage('人狼は全滅しました。');
        if (gameResult == RESULT_VILLAGERS_WIN) {
            sendMessage('村人が勝利をおさめました。');
        }
        if (gameResult == RESULT_FOX_WIN) {
            sendMessage('しかし、妖狐は生き残っていました。');
            sendMessage('妖狐が勝利をおさめました。');
        }
    }
}

function nightPhase() {
    // ターゲットリセット
    for (let villager of villagers) {
        villager.hunt = -1;
        villager.divine = -1;
        villager.guard = -1;
    }

    //ターゲットモード
    sendToVillagers('target_mode_switch clear');

    villagers.filter(
        (v) => v.role == JINRO
            && v.alive == true
    ).forEach(
        (v) => meby.send(v.username, 'target_mode_switch hunt')
    );

    villagers.filter(
        (v) => v.role == SEER
            && v.alive == true
    ).forEach(
        (v) => meby.send(v.username, 'target_mode_switch divine')
    );

    villagers.filter(
        (v) => v.role == BODYGUARD
            && v.alive == true
    ).forEach(
        (v) => meby.send(v.username, 'target_mode_switch guard')
    );
}

function epiloguePhase() {
    sendMessage('--- エンドロール ---');
    for (let villager of villagers) {
        if (showEndRole == true) {
            sendMessage('  ' + villager.name() + ' - ' + villager.username);
        } else {
            sendMessage('  ' + villager.name());
        }
    }
}

// 次の時間帯へ（タイマーによる）
function cmdNextHours(username, sid, line) {
    // タイマー完了
    if (timeout != null) {
        timeout = null;
    }

    // スキップ情報をリセットする
    for (let villager of villagers) {
        villager.skip = false;
    }
    sendToVillagers('skip_info 0 0');
    
    // ログクリア
    log = [];
    sendToVillagers('log_clear');

    // 時間帯を進める
    [days, hours] = getNextHours(days, hours, nightDuration);
    sendToVillagers('day_info ' + days + ' ' + hours);
    
    // イベント
    if (hours == HOURS_PROLOGUE) {
        // プロローグ 物語の始まり
        prologuePhase();
    } else if (hours == HOURS_MORNING) {
        // 朝 狩り投票結果
        morningPhase();
    } else if (hours == HOURS_DAY) {
        // 村人のチャットフェーズ
        dayPhase();
    } else if (hours == HOURS_EVENING) {
        // 夕方 吊り投票結果
        eveningPhase();
    } else if (hours == HOURS_NIGHT) {
        // 人狼だけのチャットフェーズ
        nightPhase();
    } else if (hours == HOURS_EPILOGUE) {
        // エピローグ 結果表示
        epiloguePhase();
    } else if (hours == HOURS_GAME_DONE) {
        // ゲーム終了 (タイトル画面へ)
        initGame();
        meby.sendAll('joined false');
        meby.sendAll('screen ' + state);
        return;
    }

    // 新しい時間帯開始
    let duration = getDuration(hours);
    if (duration != -1) {
        timeout = setTimeout(function() {
            onMsg(null, null, 'next_hours');
        }, duration * 1000 + HOURS_INTERVAL * 1000);
            
        hoursStartTime = (new Date()).getTime();
        sendToVillagers('timer_start ' + duration + ' ' + 0);
    }
}

// 吊り
function executeHang() {
    // 吊られる村人
    let hangTarget = null;
    
    // 集計の対象 (対象は生きてる村人)
    let votes = [];
    for (let villager of villagers) {
        if (villager.alive == true) {
            votes[villager.idx] = 0;
        }
    }

    // 集計する
    for (let villager of villagers) {
        if (villager.alive == false) {
            continue;
        }

        let voteTarget = villagers.find(
            (v) => v.idx == villager.vote
                && v.alive == true
        );
        if (voteTarget == null) {
            continue;
        }

        votes[voteTarget.idx]++;
    }

    // 最も多く投票された村人の候補数
    let maxVotes = 0;
    for (let vidx in votes) {
        if (votes[vidx] > maxVotes) {
            maxVotes = votes[vidx];
        }
    }

    // その投票された数が上と同じ村人リスト
    let targets = [];
    for (let vidx in votes) {
        if (votes[vidx] == maxVotes) {
            let target = villagers.find(
                (v) => v.idx == vidx
            );
            targets.push(target);
        }
    }

    // 最大獲得者が１人の場合のその村人に決定
    // ２人以上の場合は最大獲得者の中からランダム
    if (targets.length == 0) {
        return null;
    } else if (targets.length == 1) {
        hangTarget = targets[0];
    } else {
        let i = Math.floor(Math.random() * targets.length);
        hangTarget = targets[i];
    }

    // 投票結果を通知
    if (showVotes == true) {
        sendMessage('-- 投票結果（吊り） --');
        for (let villager of villagers) {
            if (villager.alive == true) {
                let target = villagers.find(
                    (v) => v.idx == villager.vote
                );
                if (villager.vote == -1) {
                    sendMessage('  ' + votes[villager.idx] + '票 ' + villager.name() + '  →  なし');
                } else {
                    sendMessage('  ' + votes[villager.idx] + '票 ' + villager.name() + '  →  ' + target.name());
                }
            }
        }
        sendMessage('');
    }

    // 投票をリセット
    for (let villager of villagers) {
        villager.vote = -1;
    }

    // 集計の結果として吊り対象はいたか
    if (hangTarget == null) {
        sendMessage('吊る対象がいませんでした。');
        return;
    }

    // 吊るし処理
    hangTarget.alive = false;
    sendToVillagers('villager_state ' + hangTarget.idx + ' ' + hangTarget.alive);
    hangIdx = hangTarget.idx;

    // 通知
    sendMessage(hangTarget.name() + 'が吊られました。');
}

// 狩り
// 狩られた村人オブジェクトを返す
// いなかった場合 null
function executeHunt() {
    // 狩られる村人
    let huntTarget = null;

    // 集計の対象 (対象は生きてる村人)
    let hunts = [];
    for (let villager of villagers) {
        if (villager.alive == true) {
            hunts[villager.idx] = 0;
        }
    }

    // 集計する
    for (let wolf of villagers) {
        if (wolf.role != JINRO) {
            continue;
        }
        if (wolf.alive == false) {
            continue;
        }

        let target = villagers.find(
            (v) => v.idx == wolf.hunt
                && v.alive == true
        );
        if (target == null) {
            continue;
        }

        hunts[target.idx]++;
    }

    // 最も多く狩り候補にされた村人の候補数
    let maxHunts = 0;
    for (let vidx in hunts) {
        if (hunts[vidx] > maxHunts) {
            maxHunts = hunts[vidx];
        }
    }

    // その候補数が上と同じ村人リスト
    let targets = [];
    for (let vidx in hunts) {
        if (hunts[vidx] == maxHunts) {
            let target = villagers.find(
                (v) => v.idx == vidx
            );
            targets.push(target);
        }
    }

    // 最大獲得者が１人の場合のその村人に決定
    // ２人以上の場合は最大獲得者の中からランダム
    if (targets.length == 0) {
        return null;
    } else if (targets.length == 1) {
        huntTarget = targets[0];
    } else {
        let i = Math.floor(Math.random() * targets.length);
        huntTarget = targets[i];
    }

    // 投票結果を通知
    sendToWolves('jmsg -- 投票結果（狩り） --');
    for (let villager of villagers) {
        if (villager.alive == true) {
            sendToWolves('jmsg  ' + hunts[villager.idx] + '票 ' + villager.name());
        }
    }
    sendToWolves('jmsg ');

    // 投票をリセット
    for (let villager of villagers) {
        villager.hunt = -1;
    }

    // 集計の結果として狩り対象はいたか
    if (huntTarget == null) {
        sendToWolves('jmsg 狩り対象がいませんでした。');
        sendToWolves('jmsg ');
        return null;
    }

    // 守護 (生きていること)
    let hunters = villagers.filter(
        (v) => v.role == BODYGUARD
            && v.alive == true
    );

    // 守護対象が自身でないこと, 守護対象は投票された村人
    for (let hunter of hunters) {
        if (hunter.guard == huntTarget.idx &&
            hunter.idx != huntTarget.idx) {
            return null;
        }
    }

    // 狩り対象が人狼か妖狐ならば狩りは失敗
    if (huntTarget.role == JINRO || huntTarget.role == FOX) {
        return null;
    }

    // 狩り
    huntTarget.alive = false;
    sendToVillagers('villager_state ' + huntTarget.idx + ' ' + huntTarget.alive);
    
    return huntTarget;
}

// 占う (占われた村人が人狼だった場合は、人狼は呪殺される)
// 占殺された村人オブジェクトを返す。
// いなかった場合 null
function executeDivine() {
    // 占い師 (生きていること, 占いの対象が指定されていること)
    let seers = villagers.filter(
        (v) => v.role == SEER
            && v.alive == true
            && v.divine != -1
    );

    for (let seer of seers) {
        // 占い師が占う村人
        let target = villagers.find(
            (v) => v.idx == seer.divine
        );
        
        // 占う
        let targetRoleName = target.role == JINRO ? '人狼' : '人間';
        meby.send(seer.username, 'jmsg 占いの結果、' + target.name() + 'は' + targetRoleName + 'でした。');
        
        // 妖狐か
        if (target.role != FOX) {
            continue;
        }

        // 呪殺
        target.alive = false;
        sendToVillagers('villager_state ' + target.idx + ' ' + target.alive);

        return target;
    }   

    return null;
}

// 霊能力 (村人が人狼かどうかを知る)
function executeSpiritual() {
    // 霊能者 (生きていること)
    let mediums = villagers.filter(
        (v) => v.role == MEDIUM
            && v.alive == true
    );

    // 霊能者のターゲットが指定されているか
    if (hangIdx == -1) {
        return;
    }

    // 霊能者のターゲット
    let target = villagers.find(
        (v) => v.idx == hangIdx
    );
    if (target == null) {
        return;
    }

    let targetRoleName = target.role == JINRO ? '人狼' : '人間';
    for (let medium of mediums) {
        meby.send(medium.username, 'jmsg 霊能力の結果、' + target.name() + 'は' + targetRoleName + 'でした。');
    }
}

// 村人側の勝利判定
function judgeByVillagers() {
    let numWolves = 0;
    let numFoxes  = 0;

    // 生きている人狼を数える
    for (let villager of villagers) {
        if (villager.alive == true) {
            if (villager.role == JINRO) {
                numWolves++;
            }
            if (villager.role == FOX) {
                numFoxes++;
            }
        }
    }
    
    // 人狼が生きてる場合、勝敗はついていない
    if (numWolves > 0) {
        return RESULT_CONTINUE;
    }

    // 人狼が全滅してる場合
    if (numFoxes > 0) {
        // 狐が生きていれば狐の勝ち
        return RESULT_FOX_WIN;
    }
    
    // 人狼も狐もいなければ人間の勝ち
    return RESULT_VILLAGERS_WIN;
}

// 人狼側の勝利判定
function judgeByWerewolf() {
    let numWolves = 0;
    let numHuman = 0;
    let numFoxes = 0;

    // 生きている村人を数える
    for (let villager of villagers) {
        if (villager.alive != true) {
            continue;
        }

        if (villager.role == HUMAN ||
            villager.role == SEER ||
            villager.role == MEDIUM ||
            villager.role == BODYGUARD ||
            villager.role == CO_OWNER ||
            villager.role == MAD_MAN) {
            numHuman++;
        }
        if (villager.role == JINRO) {
            numWolves++;
        }
        if (villager.role == FOX) {
            numFoxes++;
        }
    }

    // 人間と人狼が同数の場合
    if (numHuman <= numWolves) {
        if (numFoxes == 0) {
            // 狐がいなければ人狼の勝ち
            return RESULT_WOLVES_WIN;
        } else {
            // 狐がいれば狐の勝ち
            return RESULT_FOX_WIN;
        }
    }

    // 勝敗はついていない
    return RESULT_CONTINUE;
}

// 村を片付ける
function sweepVillage() {
    playing = false;
    joinUsernames = [];
    villagers = [];
    state = STATE_TITLE;
    meby.sendAll('screen ' + state);

    if (timeout != null) {
        clearTimeout(timeout);
        timeout = null;
    }

    meby.sendStatus('false');
}

function main() {
    usernames = [];
    log = [];

    initGame();

    meby.startWebServer(HTTP_PORT);
    
    meby.setMsgFunction(onMsg);
    meby.setListFunction(function(username, sid) {
        let idx = usernames.indexOf(username);
        if (idx == -1) {
            usernames.push(username);
        }
        console.log(usernames);
    });
    meby.setJoinFunction(function(username, sid) {
        let idx = usernames.indexOf(username);
        if (idx == -1) {
            usernames.push(username);
        }
        console.log(usernames);
    });
    meby.setLeaveFunction(function(username, sid) {
        let idx = usernames.indexOf(username);
        if (idx != -1) {
            usernames.splice(idx, 1);
        }
        console.log(usernames);
    });

    meby.startAppServer(TCP_PORT);

    meby.startDevelServer(4040);
}

main();
