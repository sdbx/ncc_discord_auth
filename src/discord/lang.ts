import * as hangul from 'hangul-js';
import Config from "../config";

export default class Lang extends Config {
    public valTrue = "ㅇ";
    public valFalse = "ㄴ";

    public nameString = "문자열";
    public nameNumber = "숫자";
    public nameBoolean = "논리";
    public valNull = "null";

    public ping = {
        helpPing: "핑 날리는 거다냥!"
    }

    public login = {
        naverOn: "로그인 됐다냥!",
        naverOff: "안됐다냥!",
        successAdmin: "%(user)s님 관리자인걸 환영한다냥!",
        failAdmin_invalidToken: "토큰이 안맞다냥..",
        failAdmin_noToken: "멍청한 %(user)s야 토큰이 없다냥!"
    };

    public paramFew = "%(param)s 파라메터가 필요하다냥!";
    public helpTitle = "도움말이다냥!";
    public helpNoExists = "%(help)s 명령어는 없다냥!";
    public helpDesc = "도움말 그 자체";

    public sudoNeed = "관리자(%(users)s) 명령어다냥!";

    public setNotFound = "%(depth)s에서 %(name)s을 찾을 수 없어양!";
    public setTypeError = "%(depth)s의 타입이 %(type)s이당!";
    public setSuccess = "%(config)s의 %(key)s을 %(old)s에서 %(value)s%(to)s 설정했다냥!";

    constructor() {
        super("lang");
    }
    public getType(obj:any) {
        switch (typeof obj) {
            case "boolean": return this.nameBoolean; break;
            case "function": return "Function"; break;
            case "number": return this.nameNumber; break;
            case "object": return "Object"; break;
            case "string": return this.nameString; break;
            case "symbol": return "Symbol"; break;
            case "undefined" : return "Undefined"; break;
        }
        throw new Error(".");
    }
}
