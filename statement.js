module.exports = class Statement {
    constructor(type, idx, to, text) {
	// 発言タイプ 'jmsg'..ログ, 'say'..村人の発言, 'howl'..遠吠え, 'groan'..うめき
        // 通信メッセージのコマンドと同じ
	this.type = type;

	// 発言村人 index (-1 のときはシステムから)
	this.idx = idx;

	// 誰に 'ALL'..村人全員, 'WOLVES'..人狼, 'VICTIMS'..犠牲者
	this.to = to;
	
	// 発言内容
	this.text = text;
    }	

    toString() {
	if (this.type == 'jmsg') {
	    return this.type + ' ' + this.text;
	}

	return this.type + ' ' + this.idx + ' ' + this.text;
    }
};
