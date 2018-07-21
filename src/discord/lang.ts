import * as hangul from 'hangul-js';
import Config from "../config";

export default class Lang extends Config {
    public valTrue = "ㅇ";
    public valFalse = "ㄴ";

    public nameString = "문자열";
    public nameNumber = "숫자";
    public nameBoolean = "논리";
    public valNull = "null";
    /**
     * Module: ping
     */
    public ping = {
        helpPing: "핑 날리는 거다냥!",
    }
    /**
     * Module: auth
     */
    public login = {
        naverId: "네이버 아이디",
        naverRequest: "%(type)s%(suffix)s 입력해달라냥~",
        naverAlreadyOn: "이미 %(id)s로 로그인이 이미 됐다냥!",
        naverOn: "로그인 됐다냥!",
        naverWrongPW: "아이디나 비번이 다르다냥!",
        naverReqCaptcha: "캡챠를 입력해달라냥..",
        naverOff: "안됐다냥!",
        passwordDelete: "비밀번호 보낸 거 삭제해달라냥!",
        successAdmin: "%(user)s님 관리자인걸 환영한다냥!",
        failAdmin_invalidToken: "토큰이 안맞다냥..",
        failAdmin_noToken: "멍청한 %(user)s야 토큰이 없다냥!",
    };
    /**
     * Module: auth
     */
    public auth = {
        authCmdDesc: "네이버 카페 회원인지 인증하는거다냥!",
        nickNotFound: "%(nick)s(%(type)s) 회원을 찾을 수 없다냥..",
        roomNotMaked: "방을 못만들었다냥! 실패다냥~",
        onlyGroup: "그룹만 사용할 수 있다냥!",
        proxyFailed: "인증용 채팅방이 존재하지 않는다냥.",
        authing: "이미 인증중이냥, 네카채를 확인해달라냥~",
        authed: "인증 완료",
    }
    /**
     * Module: sample
     */
    public sample = {
        hello: "안녕",
    }
    /**
     * Global..
     */
    public paramFew = "%(param)s 파라메터가 필요하다냥!";
    // help
    public helpTitle = "도움말이다냥!";
    public helpNoExists = "%(help)s 명령어는 없다냥!";
    public helpDesc = "도움말 그 자체";
    // set
    public setNotFound = "%(depth)s에서 %(name)s을 찾을 수 없어양!";
    public setTypeError = "%(depth)s의 타입이 %(type)s이당!";
    public setSuccess = "%(config)s의 %(key)s을 %(old)s에서 %(value)s%(to)s 설정했다냥!";
    // admin
    public sudoNeed = "관리자 명령어다냥!";
    public adminGranted = "%(mention)s님 인증완료.";
    // notlogin
    public noNaver = "네이버 계정으로 로그인 안되어 있다냥..";

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
