import { EventEmitter } from "events";
import { CookieJar } from "tough-cookie";

export default class Credential extends EventEmitter {
    public username;
    public password;
    private cookiejar:CookieJar;
    constructor(username = "id",password = "pw") {
        super();
        this.username = username;
        this.password = password;
        this.cookiejar = new CookieJar();
    }
    public set cookieJar(_jar:CookieJar.Serialized) {
        if (_jar != null) {
            this.cookiejar = CookieJar.deserializeSync(_jar);
        } else {
            this.cookiejar = new CookieJar();
        }
    }
    public get cookieJar():CookieJar.Serialized {
        return this.cookiejar.serializeSync();
    }
}