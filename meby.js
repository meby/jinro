'use strict';
 
// web
exports.startWebServer = startWebServer;
 
// app
exports.setMsgFunction = setMsgFunction;
exports.setListFunction = setListFunction;
exports.setJoinFunction = setJoinFunction;
exports.setLeaveFunction = setLeaveFunction;
exports.startAppServer = startAppServer;
exports.sendAll = sendAll;
exports.send = send;
exports.sendBySid = sendBySid;
exports.sendLog = sendLog;
exports.sendStatus = sendStatus;
 
// devel
exports.startDevelServer = startDevelServer;

// lib
exports.split = split;
exports.array_append = array_append;
exports.array_flatten = array_flatten;
 
// web server
function startWebServer(httpPort) {
    let http = require('http');
    let connect = require('connect');
    let serveStatic = require('serve-static');
    let app = connect().use(serveStatic('html'));
    http.createServer(app).listen(httpPort);
}
 
// app server
let net = require('net');
let socket = null;
let onUserlistAddFunc = null;
let onUserJoinFunc = null;
let onUserLeaveFunc = null;
let onMsgFunc = null;
 
// devel server
class DevelClient {
    constructor(sid, username, socket) {
        this.sid = sid;
        this.username = username;
        this.socket = socket;
    }
}
let develClients = [];

function setMsgFunction(f) {
    onMsgFunc = f;
}
function setListFunction(f) {
    onUserlistAddFunc = f;
}
function setJoinFunction(f) {
    onUserJoinFunc = f;
}
function setLeaveFunction(f) {
    onUserLeaveFunc = f;
}

function startAppServer(appPort) {
    net.createServer(function(ss) {
        console.log('on connect');
        socket = ss;
 
        ss.on('data', function(buf) {
            onRecvBuffer(buf);
        });
        ss.on('close', function() {
            console.log('on close');
            socket = null;
        });
        ss.on('error', function(err) {
            console.log('on error : ' + err);
            socket = null;
        });
    }).listen(appPort);
}
 
function startDevelServer(appPort) {
    net.createServer(function(socket) {
        console.log('on devel connect');
 
        socket.on('data', function(buf) {
            onDevelRecvBuffer(socket, buf);
        });
        socket.on('close', function() {
            console.log('on devel close');
//          develSockets.splice(develSockets.indexOf(socket), 1);
        });
        socket.on('error', function(err) {
            console.log('on devel error : ' + err);
//          develSockets.splice(develSockets.indexOf(socket), 1);
        });
    }).listen(appPort);
}
 
// convert buffer to string, split to lines, and call function every line
function onRecvBuffer(buf) {
    let str = buf.toString('utf-8', 0, buf.length);
    let lines = str.split(/\r?\n/);
 
    if (lines[lines.length - 1] == '') {
        lines.pop();
    }
 
    for (let line of lines) {
        deal(line);
    }
}
 
// convert buffer to string, split to lines, and call function every line
function onDevelRecvBuffer(socket, buf) {
    let str = buf.toString('utf-8', 0, buf.length);
    let lines = str.split(/\r?\n/);
 
    if (lines[lines.length - 1] == '') {
        lines.pop();
    }
 
    let develClient = null;
    for (let dc of develClients) {
        if (dc.socket == socket) {
            develClient = dc;
            break;
        }
    }

    for (let line of lines) {
        if (develClient == null) {
            let ary = split(line, ' ', 3);
            if (ary[0] == 'enter') {
                let sid = parseInt(ary[1]);
                let username = ary[2];
                develClient = new DevelClient(sid, username, socket);
                develClients.push(develClient);

                if (onUserJoinFunc != null) {
                    onUserJoinFunc(username, sid);
                }
            }
        } else {
            deal('user_msg ' + develClient.username + ' ' + develClient.sid + ' ' + line);
        }
    }
}
 
// MEBY system message: 'userlist_add', 'user_join', 'user_leave'
// app client message: 'user_msg'
function deal(line) {
    console.log('[' + line + ']');

    let strs = split(line, ' ', 4);
    let cmd = strs[0];
    let username = strs[1];
    let sid = strs[2];
    let msg = strs[3];
 
    if (cmd == 'userlist_add') {
        if (onUserlistAddFunc != null) {
            onUserlistAddFunc(username, sid);
        }
    }
    if (cmd == 'user_join') {
        if (onUserJoinFunc != null) {
            onUserJoinFunc(username, sid);
        }
    }
    if (cmd == 'user_leave') {
        if (onUserLeaveFunc != null) {
            onUserLeaveFunc(username, sid);
        }
    }
    if (cmd == 'user_msg') {
        if (onMsgFunc != null) {
            onMsgFunc(username, sid, msg);
        }
    }
}
 
// send message to app client of all users
function sendAll(line) {
    if (socket == null) {
        return;
    }
 
    console.log('S->C ' + line);
    socket.write('send_all ' + line + "\n");

    for (let develClient of develClients) {
        develClient.socket.write(line + "\n");
    }
}
 
// send message to app client of the user specified by username
function send(username, line) {
    if (socket == null) {
        return;
    }
 
    console.log('S->C(' + username + ') ' + line);
    socket.write('send ' + username + ' ' + line + "\n");

    for (let develClient of develClients) {
        if (develClient.username == username) {
            develClient.socket.write(line + "\n");
        }
    }
}
 
// send message to app client of the user specified by sid
function sendBySid(sid, line) {
    if (socket == null) {
        return;
    }
 
    console.log('S->C(' + sid + ') ' + line);
    socket.write('send_sid ' + sid + ' ' + line + "\n");

    for (let develClient of develClients) {
        if (develClient.sid == sid) {
            develClient.socket.write(line + "\n");
        }
    }
}
 
// send message to log area of all users
function sendLog(line) {
    if (socket == null) {
        return;
    }
 
    socket.write('log_all ' + line + "\n");
}
 
// send application status
function sendStatus(line) {
    if (socket == null) {
        return;
    }
 
    socket.write('app_status ' + line + "\n");
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

function array_append(src, target) {
    for (let element of target) {
        src.push(element);
    }
}

function array_flatten(items) {
    const flat = [];
    
    items.forEach(item => {
        if (Array.isArray(item)) {
            flat.push(...array_flatten(item));
        } else {
            flat.push(item);
        }
    });
    
    return flat;
}
