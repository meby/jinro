// send message to user app server
function send(msg) {
    window.parent.postMessage('TO_USER_SERVER ' + msg, '*');
}

function receiveMessage(event) {
    onMsg(event.data);
}

// application:
let joined = false;
let hoursDuration;
let hoursElapsedTime;
let timeout = null;

let day;
let hours;

let vidx2chara = [];
let vidx2alive = [];
let vidx2name = [];

let selfVidx = -1;
let selfRole = -1;

let statementMode = 'say'; // 'say', 'howl', 'groan'
let targetMode = 'none';   // 'none', 'vote', 'hunt', 'divine', 'guard'

let voteVidx = -1;
let huntVidx = -1;
let divineVidx = -1;
let guardVidx = -1;

const ROLENAMES = {
    'human': '村人',
    'seer': '占い師',
    'medium': '霊能者',
    'bodyguard': '狩人',
    'co_owner': '共有者',
    'jinro': '人狼',
    'mad_man': '狂人',
    'fox': '妖狐'
};

const BYWORDS = ['村長', '村長の妻', '村長の娘', '農夫', '鍛冶屋', '木こり', '書生', '隠者', '雑貨屋', '医師', '見習い看護婦', '見習いメイド', '牧師', '修道女', '酒場の主人', '酒場の看板娘', '双子', '双子', '新米記者', '踊り子', '未亡人', '逃亡者', '教師', '学生', '学生', '文学少女', '牧童', 'お嬢様', '流れ者', 'お尋ね者', '冒険家', '美術商', '吟遊詩人', '墓守', '交易商', 'ちんぴら', 'のんだくれ', 'ごくつぶし', '資産家', '語り部', '旅芸人', '旅芸人', '異国人'];
const JNAMES = ['アーノルド', 'エレノア', 'シャーロット', 'グレン', 'ゴードン', 'ダニエル', 'ハーヴェイ', 'モーガン', 'レベッカ', 'ヴィンセント', 'ニーナ', 'ネリー', 'ルーサー', 'ステラ', 'フレディ', 'ローズマリー', 'リック', 'ウェンディ', 'ソフィー', 'キャロル', 'オードリー', 'カミーラ', 'イザベラ', 'ラッセル', 'メイ', 'セシリア', 'トビー', 'ヘンリエッタ', 'ギルバート', 'クインジー', 'ナサニエル', 'ヒューバート', 'コーネリアス', 'ユージーン', 'ベンジャミン', 'ノーマン', 'ケネス', 'ミッキー', 'ジェーン', 'デボラ', 'ボブ', 'ドリス', 'マンジロー'];

const CMD_FUNCS = {
    'screen': cmdScreen,
    'playing': cmdPlaying,
    'looking_start': cmdLookingStart,
    'joined': cmdJoined,
    'join_info': cmdJoinInfo,
    'game_start': cmdGameStart,
    'jmsg': cmdJmsg,
    'say': cmdSay,
    'howl': cmdHowl,
    'groan': cmdGroan,
    'log_clear': cmdLogClear,
    'day_info': cmdDayInfo,
    'target_mode_switch': cmdTargetModeSwitch,
    'timer_start': cmdTimerStart,
    'skip_info': cmdSkipInfo,
    'self_data': cmdSelfData,
    'villager_list': cmdVillagerList,
    'villager_state': cmdVillagerState,
    'vote_target': cmdVoteTarget,
    'hunt_target': cmdHuntTarget,
    'divine_target': cmdDivineTarget,
    'guard_target': cmdGuardTarget
};

// dispatch messages from server
function onMsg(msg) {
    let ary = split(msg, ' ', 2);
    let cmd = ary[0];
    let arg = ary[1];

    let func = CMD_FUNCS[cmd];
    if (func != null) {
	func(arg);
    }
}

function cmdScreen(line) {
    let screen = line;
    
    $('#title').css('display', 'none');
    $('#build').css('display', 'none');
    $('#looking').css('display', 'none');
    $('#village').css('display', 'none');

    if (screen == 'title') {
	$('#title').css('display', 'block');
    }

    if (screen == 'looking') {
        $('#join_button').css('display', joined == true ? 'none' : 'block');
	$('#looking').css('display', 'block');
    }

    if (screen == 'game') {
	$('#village').css('display', 'block');
    }
}

function cmdPlaying(line) {
    let playing = line == 'true' ? true : false;

    if (playing == true) {
        $('#playing').html('現在プレイ中です。');
        $('#to_build_button').css('display', 'none');
    } else {
        $('#playing').html('');
        $('#to_build_button').css('display', 'block');
    }
}

function cmdLookingStart(line) {
    let entryDuration = parseInt(line);
    let startTime = (new Date()).getTime();

    function clock() {
        let elapsedTime = (new Date()).getTime() - startTime;
        let rest = entryDuration * 1000 - elapsedTime;
        if (rest > 0) {
            $('#entry_timer_info').html('募集締め切りまで : ' + Math.floor((rest + 500) / 1000) + '秒');
            setTimeout(clock, 100);
        } else {
            $('#entry_timer_info').html('');
        }
    }

    $('#entry_timer_info').html(entryDuration);
    clock();
}

function cmdJoined(line) {
    joined = line == 'true' ? true : false;
    
    if (joined == true) {
        $('#join_button').css('display', 'none');
    } else {
        $('#join_button').css('display', 'block');
    }
}

function cmdJoinInfo(line) {
    $('#join_info').html('現在参加人数 : ' + line + '人');
}

function cmdGameStart(line) {
    vidx2chara = [];
    vidx2alive = [];
    vidx2name = [];

    selfVidx = -1;
    selfRole = -1;

    $('#log').html('');
    $('#characters').html('');
    $('#skip_button').css('display', 'block');
}

function addLog(html) {
    let obj = document.getElementById('log');
    let isBottom = false;
    if (obj.scrollTop == obj.scrollHeight - obj.clientHeight) {
        isBottom = true;
    }

    $('#log').append(html);
    if (isBottom == true) {
        $('#log').animate({scrollTop: obj.scrollHeight - obj.clientHeight}, 100, 'swing');
    }
}

function cmdJmsg(line) {
    line = line.replace(/ /g, '&nbsp;');

    if (line == '') {
        addLog('<br>');
    } else {
        addLog(
            $('<div>')
                .css('color', '#f0f0f0')
                .html(line));
    }
}

function cmdSay(line) {
    let ary = split(line, ' ', 2);
    let villagerIdx = parseInt(ary[0]);
    let statement = ary[1];

    let chara = vidx2chara[villagerIdx];
    let face = $('<img>')
        .attr('src', 'img/' + chara + '.png')
        .attr('width', '40')
    let say = $('<div>')
        .css('padding-bottom', '2px')
        .append(
            $('<div>')
                .css('display', 'inline-block')
                .css('vertical-align', 'top')
                .html(face),
            $('<div>')
                .css('display', 'inline-block')
                .css('padding', '2px 0 0 10px')
                .html('<div style="padding: 0; font-size: 11px; color: #d0d0d0;">' + getCharaName(villagerIdx) + '</div><div style="padding: 2px 0 0 0;">' + statement + '</div>'));
    addLog(say);
}

function cmdHowl(line) {
    let ary = split(line, ' ', 2);
    let villagerIdx = parseInt(ary[0]);
    let statement = ary[1];

    let chara = vidx2chara[villagerIdx];
    let face = $('<img>')
        .attr('src', 'img/' + chara + '.png')
        .attr('width', '40')
        .css('background-color', '#702010');
    let say = $('<div>')
        .css('padding-bottom', '2px')
        .append(
            $('<div>')
                .css('display', 'inline-block')
                .css('vertical-align', 'top')
                .html(face),
            $('<div>')
                .css('display', 'inline-block')
                .css('padding', '2px 0 0 10px')
                .html('<div style="padding: 0; font-size: 11px; color: #d0d0d0;">' + getCharaName(villagerIdx) + '</div><div style="padding: 2px 0 0 0;">' + statement + '</div>'));
    addLog(say);
}

function cmdGroan(line) {
    let ary = split(line, ' ', 2);
    let villagerIdx = parseInt(ary[0]);
    let statement = ary[1];

    let chara = vidx2chara[villagerIdx];
    let face = $('<img>')
        .attr('src', 'img/' + chara + '.png')
        .attr('width', '40')
        .css('background-color', '#102030');
    let say = $('<div>')
        .css('padding-bottom', '2px')
        .append(
            $('<div>')
                .css('display', 'inline-block')
                .css('vertical-align', 'top')
                .html(face),
            $('<div>')
                .css('display', 'inline-block')
                .css('padding', '2px 0 0 10px')
                .html('<div style="padding: 0; font-size: 11px; color: #d0d0d0;">' + getCharaName(villagerIdx) + '</div><div style="padding: 2px 0 0 0;">' + statement + '</div>'));
    addLog(say);
}

function cmdLogClear(line) {
    $('#log').html('');
}

function cmdDayInfo(line) {
    let ary = line.split(' ');
    day = ary[0];
    hours = ary[1];

    const JNAMES = {
        'prologue': 'プロローグ',
        'morning': '朝',
        'day': '昼',
        'evening': '夕方',
        'night': '夜',
        'epilogue': 'エピローグ'};

    let jhours = JNAMES[hours];

    if (day == 0) {
        $('#day_info').html(jhours);
    } else {
        $('#day_info').html(day + '日 ' + jhours);
    }

    if (canSubmit()) {
        $('#self_chara').css('filter', 'sepia(0.3) opacity(0.8)');
    } else {
        $('#self_chara').css('filter', 'sepia(1) opacity(0.4)');
    }
}

function cmdTargetModeSwitch(line) {
    if (line == 'clear') {
        $('#vote_button').hide();
        $('#hunt_button').hide();
        $('#divine_button').hide();
        $('#guard_button').hide();

        for (let i = 0; i < vidx2chara.length; i++) {
            $('#chara' + i).html('');
        }

        targetMode = 'none';
    }

    if (line == 'vote') {
        voteVidx = -1;
        $('#vote_button').show();

        if (targetMode == 'none') {
            targetMode = 'vote';
        }
    }

    if (line == 'hunt') {
        huntVidx = -1;
        $('#hunt_button').show();

        if (targetMode == 'none') {
            targetMode = 'hunt';
        }
    }

    if (line == 'divine') {
        divineVidx = -1;
        $('#divine_button').show();

        if (targetMode == 'none') {
            targetMode = 'divine';
        }
    }

    if (line == 'guard') {
        guardVidx = -1;
        $('#guard_button').show();

        if (targetMode == 'none') {
            targetMode = 'guard';
        }
    }
}

function cmdTimerStart(line) {
    let ary = line.split(' ');
    hoursDuration = parseInt(ary[0]);
    hoursElapsedTime = parseInt(ary[1]);

    if (timeout != null) {
        clearTimeout(timeout);
        timeout = null;
    }

    let startTime = (new Date()).getTime();

    function clock() {
        let localElapsedTime = (new Date()).getTime() - startTime;
        let sum = localElapsedTime + hoursElapsedTime * 1000;
        if (sum < hoursDuration * 1000) {
            $('#timer_info').html('経過時間 ' + Math.floor((sum + 500) / 1000) + '秒 (' + hoursDuration + '秒)');
            timeout = setTimeout(clock, 100);
        } else {
            sum = hoursDuration * 1000;
            $('#timer_info').html('経過時間 ' + Math.floor((sum + 500) / 1000) + '秒 (' + hoursDuration + '秒)');
        }
    }

    clock();
}

function cmdSkipInfo(line) {
    let ary = line.split(' ');
    let numSkips = parseInt(ary[0]);
    let numAlives = parseInt(ary[1]);

    if (numSkips == 0 || numAlives == 0) {
        $('#skip_info').html('');
    } else {
        $('#skip_info').html('スキップ ' + numSkips + ' / ' + numAlives);
    }
}

function cmdSelfData(line) {
    let ary = line.split(' ');
    let vidx = parseInt(ary[0]);
    let chara = parseInt(ary[1]);
    let role = ary[2];

    selfVidx = vidx;
    selfRole = role;

    if (selfVidx == -1) {
        $('#self_chara').html('');
        $('#self_data').html('');

        $('#title').css('display', 'block');
        $('#build').css('display', 'none');
        $('#looking').css('display', 'none');
        $('#village').css('display', 'none');
    } else {
        $('#self_chara').html('<img src="img/' + chara + '.png">');
        $('#self_data').html('[ ' + ROLENAMES[role] + ' ] ' + getCharaName(selfVidx));

        if (role == 'JINRO') {
            $('#say_button').css('display', 'inline-block');
            $('#howl_button').css('display', 'inline-block');
        }
        $('#skip_button').css('display', 'inline-block');
    }
}

function targetOver(targetVidx) {
    if (vidx2alive[targetVidx] == false) {
        return;
    }

    if (!['vote', 'hunt', 'divine', 'guard'].includes(targetMode)) {
        return;
    }

    if (targetMode == 'vote' && voteVidx != -1) {
        return;
    }

    if (targetMode == 'hunt' && huntVidx != -1) {
        return;
    }

    if (targetMode == 'divine' && divineVidx != -1) {
        return;
    }

    if (targetMode == 'guard' && guardVidx != -1) {
        return;
    }

    $('#cursor').remove();

    let cursor = $('<div>')
        .attr('id', 'cursor')
        .attr('class', 'cursor')
        .html($('<img>')
              .attr('src', 'img/' + targetMode + '.png')
              .attr('width', '60')
              .css('vertical-align', 'middle')
              .css('filter', 'opacity(0.75)')
              .css('pointer-events', 'none'));
    $('#chara' + targetVidx).append(cursor);
}

function targetClick(targetVidx) {
    if (vidx2alive[targetVidx] == false) {
        return;
    }

    if (!['vote', 'hunt', 'divine', 'guard'].includes(targetMode)) {
        return;
    }

    $('#cursor').remove();

    send(targetMode + ' ' + targetVidx);
}

function cmdVillagerList(line) {
    let ary = line.split(' ');
    let numVillagers = parseInt(ary.shift());

    let charaHeight = Math.floor((600 - 40) / Math.floor((numVillagers + 2) / 3)) - 2;
    if (charaHeight > 94) {
        charaHeight = 94;
    }
    let charaOffset = -Math.floor((94 - charaHeight) / 2);

    for (let i = 0; i < numVillagers; i++) {
        let ary2 = ary[i].split(':');
        let charaId = parseInt(ary2[0]);
        let name = ary2[1];
        vidx2chara[i] = charaId;
        vidx2name[i] = name;
	$('#characters').append('<div id="chara' + i + '" class="chara"></div>');
        $('#chara' + i).css('height', charaHeight + 'px');
        $('#chara' + i).css('background-image', 'url(img/' + charaId + '.png)');
        $('#chara' + i).css('background-position', '0px ' + charaOffset + 'px');
        $('#chara' + i).on({
            'mouseenter': function(e) {
                targetOver(i);
            },
            'click': function(e) {
                targetClick(i);
            }
        });
    }
}

function cmdVillagerState(line) {
    let ary = line.split(' ');
    let villagerIdx = parseInt(ary[0]);
    let alive = ary[1] == 'true' ? true : false;

    vidx2alive[villagerIdx] = alive;

    if (alive == true) {
	$('#chara' + villagerIdx).css('background-color', '#d0d0d0');
    } else {
        $('#chara' + villagerIdx).css('background-color', '#505050');
	$('#chara' + villagerIdx).css('filter', 'sepia(1) opacity(0.5)');
    }

    if (villagerIdx == selfVidx) {
        if (alive == true) {
            if (selfRole == 'jinro') {
                jinroDeck();
            } else {
                villagerDeck();
            }
        } else {
            victimDeck();
        }
    }
}

function getCharaName(vidx) {
    return vidx2name[vidx];
}

function cmdVoteTarget(line) {
    let vidx = parseInt(line);

    voteVidx = vidx;

    $('#chara' + vidx).append('<img src="img/vote.png" width="30">');
}

function cmdHuntTarget(line) {
    let vidx = parseInt(line);

    huntVidx = vidx;

    $('#chara' + vidx).append('<img src="img/hunt.png" width="30">');
}

function cmdDivineTarget(line) {
    let vidx = parseInt(line);

    divineVidx = vidx;

    $('#chara' + vidx).append('<img src="img/divine.png" width="30">');
}

function cmdGuardTarget(line) {
    let vidx = parseInt(line);

    guardVidx = vidx;

    $('#chara' + vidx).append('<img src="img/guard.png" width="30">');
}

function sayMode() {
    statementMode = 'say';
    $('#deck').css('background-color', '#706050');
}

function howlMode() {
    statementMode = 'howl';
    $('#deck').css('background-color', '#702010');
}

function groanMode() {
    statementMode = 'groan';
    $('#deck').css('background-color', '#102030');
}

function villagerDeck() {
    sayMode();
    $('#say_button').css('display', 'none');
    $('#howl_button').css('display', 'none');
    $('#groan_button').css('display', 'none');
    $('#skip_button').css('display', 'display');
}

function jinroDeck() {
    sayMode();
    $('#say_button').css('display', 'inline-block');
    $('#howl_button').css('display', 'inline-block');
    $('#groan_button').css('display', 'none');
    $('#skip_button').css('display', 'display');
}

function victimDeck() {
    groanMode();
    $('#say_button').css('display', 'none');
    $('#howl_button').css('display', 'none');
    $('#groan_button').css('display', 'none');
    $('#skip_button').css('display', 'none');
}

// 発言(遠吠え,うめき)できるか
function canSubmit() {
    // 発言タイプ, ロール, 発言時間, 
    if (statementMode == 'say') {
        if (hours == 'day') {
            return true;
        }
    }

    if (statementMode == 'howl') {
        if (hours == 'night') {
            if (selfRole == 'jinro') {
                return true;
            }
        }
    }

    if (statementMode == 'groan') {
        if (hours == 'day' || hours == 'night') {
            if (vidx2alive[selfVidx] == false) {
                return true;
            }
        }
    }

    return false;
}

function attachEventHandlers() {
    $('#to_build_button').click(
	function(e) {
	    $('#title').css('display', 'none');
	    $('#build').css('display', 'block');
	    $('#looking').css('display', 'none');
	    $('#village').css('display', 'none');
	}
    );

    $('#to_title_button').click(
	function(e) {
	    $('#title').css('display', 'block');
	    $('#build').css('display', 'none');
	    $('#looking').css('display', 'none');
	    $('#village').css('display', 'none');
	}
    );

    $('#build_button').click(
	function(e) {
            let ary = [];
            ary.push($('#min_number').val());
            ary.push($('#recruit_duration').val());
            ary.push($('#morning_duration').val());
            ary.push($('#day_duration').val());
            ary.push($('#evening_duration').val());
            ary.push($('#night_duration').val());
            ary.push($('#epilogue_duration').val());
	    let endRole = true;
            ary.push(endRole);
	    send('make_village ' + ary.join(' '));
	}
    );

    $('#join_button').click(
	function(e) {
	    send('join');
	}
    );

    $('#chat_input').keydown(
	function(e) {
	    if (e.keyCode != 13) {
		return true;
	    }

            if (canSubmit() == false) {
                return false;
            }

	    let statement = $('#chat_input').val();
            if (statement == '') {
                return false;
            }

            if (statementMode == 'say') {
	        send('say ' + statement);
            }
            if (statementMode == 'howl') {
	        send('howl ' + statement);
            }
            if (statementMode == 'groan') {
	        send('groan ' + statement);
            }
	    $('#chat_input').val('');

	    return false;
	}
    );

    $('#say_button').click(
	function(e) {
            sayMode();
	}
    );

    $('#howl_button').click(
	function(e) {
            howlMode();
	}
    );

    $('#groan_button').click(
	function(e) {
            groanMode();
	}
    );

    $('#vote_button').click(
	function(e) {
            targetMode = 'vote';
	}
    );

    $('#hunt_button').click(
	function(e) {
            targetMode = 'hunt';
	}
    );

    $('#divine_button').click(
	function(e) {
            targetMode = 'divine';
	}
    );

    $('#guard_button').click(
	function(e) {
            targetMode = 'guard';
	}
    );

    $('#skip_button').click(
	function(e) {
	    send('skip');
	}
    );
}

// split('a b c d e', ' ', 3) -> ['a', 'b', 'c d e']
function split(str, delimiter, limit) {
    let strs = [];
    
    while (limit - 1 > 0) {
	let idx = str.indexOf(delimiter);
	if (idx == -1) {
	    break;
	}
 
	strs.push(str.substring(0, idx));
	str = str.substring(idx + 1);
 
	limit--;
    }
    strs.push(str);
 
    return strs;
}

$(window).on('load', function() {
    attachEventHandlers();

    window.addEventListener('message', receiveMessage, false);

    send('loaded');
});
