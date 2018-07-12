import Config from "../config";

export default class Lang extends Config {
    public valTrue = "true";
    public valFalse = "false";
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

    constructor() {
        super("lang");
    }
}