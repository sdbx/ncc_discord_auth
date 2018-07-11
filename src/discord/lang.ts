import Config from "../config";

export default class Lang extends Config {
    public valTrue = "true";
    public valFalse = "false";
    public valNull = "null";

    public textAuthSuccess = "%(user)s님 인증 완료다냐!"

    constructor() {
        super("lang");
    }
}