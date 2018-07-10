import * as _caller from "caller";
import chalk, { Chalk } from "chalk";
import * as cjk from "cjk-regex";
import * as path from "path";

const colorLevel = chalk.supportsColor.level;
// 1: 8color 2: 256color 3: 0xFFFFFF color
/*
const chalk = new _chark.constructor({
    level: colorLevel + 1
});
*/

export function w(arg1:string,arg2:string = null) {
    let header;
    let num;
    let content;
    switch (colorLevel) {
        case 3: {
            header = chalk.bgHex("#ffe4a5").hex("#303030");
            num = chalk.bgHex("#f0f0f0").hex("#424242");
            content = chalk.bgHex("#303030").hex("#ffdd99");
        }
        break;
        default: {
            header = chalk.bgYellow.white;
            num = chalk.bgWhite.gray;
            content = chalk.bgBlack.yellow;
        }
    }
    raw(
        header,
        num,
        content,
        arg1,arg2
    );
}

const prefixLimit = 20;
const numberLimit = 3;
const contentLimit = 80;
export function raw(headerColor:Chalk,numberColor:Chalk,contentColor:Chalk,arg1:string,arg2:string = null) {
    const prefix = arg2 == null ? caller() : arg1;
    const message = arg2 == null ? arg1 : arg2;
    // [20](prefix) [3](num) [1](|) [40+](content)
    const sends = message.split("\n").map((str) => {
        const out:string[] = [];
        while (str.length > 0) {
            const piece = cutstr(str,contentLimit);
            out.push(piece);
            str = str.replace(piece,"");
        }
        return out;
    });
    let useNum = true;
    if (sends.length === 0 || (sends.length === 1 && sends[0].length <= 1)) {
        // only one message
        useNum = false;
    }
    sends.forEach((value,index) => {
        value.forEach((_v,_i) => {
            _log(headerColor,(index === 0 && _i === 0) ? prefix.toString() : "",
                numberColor,(_i === 0 && useNum) ? index.toString() : "",
                contentColor,_v);
        });
    });
}

function _log(headerColor:Chalk, headerMsg:string, numberColor:Chalk, numberMsg:string, contentColor:Chalk, contentMsg:string) {
    headerMsg = cutstr(headerMsg,prefixLimit);
    numberMsg = cutstr(numberMsg,numberLimit);
    contentMsg = cutstr(contentMsg,contentLimit);
    const format = [
        headerColor(headerMsg.padStart(prefixLimit - unicodeLength(headerMsg)) + " "),
        numberColor(numberMsg.padStart(numberLimit - unicodeLength(numberMsg)) + " "),
        contentColor(contentMsg.padEnd(contentLimit - unicodeLength(contentMsg)))
    ].join("");
    console.log(format);
}
function caller() {
    let out:string = path.resolve(_caller(2)).replace(path.resolve(__dirname),"");
    if (out.length >= prefixLimit) {
        out = `...${out.substr(out.lastIndexOf("/"))}`;
    }
    return out;
}
function length(str:string) {
    const asciis = str.match(/[ -~]/ig).length;
    const unicodes =  unicodeLength(str);
    return asciis + 2 * unicodes;
}
function unicodeLength(str:string) {
    return str.replace(/[ -~]/ig, "").length;
}
function cutstr(str:string, end:number) {
    let ln = 0;
    let i = 0;
    for (const char of str.split("")) {
        const cn = char.charCodeAt(0);
        ln += (cn >= 32 && cn <= 126) ? 1 : 2;
        i += 1;
        if (ln >= end) {
            return str.substring(0,i);
        }
    }
    return str;
}