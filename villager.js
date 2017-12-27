const NAME = require('./name.json');

module.exports = class Villager {
    constructor(idx, username, chara, role) {
	// プレイ中の村人の連番
	this.idx = idx;

	// ユーザーID
	this.username = username;

	// キャラクター番号 0 ～ 42
	this.chara = chara;

	// 役職番後 0 ～ 7
	this.role = role;

	// 生存しているかどうか
	this.alive = true;

	// 吊るしの投票 villager.idx 未選択時は -1
	this.vote = -1;

	// 狩りの投票 villager.idx 未選択時は -1
	this.hunt = -1;

	// 占いの対象 villager.idx 未選択時は -1
	this.divine = -1;

	// 守りの対象 villager.idx 未選択時は -1
	this.guard = -1;

	// スキップ いまいる時間帯をスキップする意思表示
	this.skip = false;
    }

    name() {
        if (this.chara == -1) {
            return '-';
        }

        return NAME['chara'][this.chara][0] + NAME['chara'][this.chara][1];
    }
};
