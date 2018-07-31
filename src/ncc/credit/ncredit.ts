import * as caller from "caller";
import * as iconv from "encoding";
import { EventEmitter } from "events";
import * as get from "get-value";
import { Agent } from "https";
import * as orgrq from "request";
import * as request from "request-promise-native";
import { Cookie, CookieJar, parseDate } from "tough-cookie";
import Log from "../../log";
import { CHAT_API_URL, CHAT_APIS, CHAT_HOME_URL, COOKIE_SITES } from "../ncconstant";
import encryptKey from "./loginencrypt";

export default class NCredit extends EventEmitter {
    public username:string;
    protected _password:string;
    protected cookieJar:CookieJar = new CookieJar();
    private httpsAgent = new Agent({
        keepAlive: true
    });
    constructor(username?:string, password?:string) {
        super();
        this.username = username;
        this._password = password;
    }
    public clear() {
        this.cookieJar = new CookieJar();
    }
    public set(username?:string, password?:string) {
        this.clear();
        if (username != null) {
            this.username = username;
        }
        if (password != null) {
            this._password = password;
        }
    }
    /**
     * Validate Naver logined.
     * Recommand Caching value
     * @param captcha Naver captcha parameter(check other class for detail)
     */
    public async login(captcha:{key:string, value:string} = null) {
        log("Starting logging in");
        log("Creating new cookie jar");
        this.cookieJar = new CookieJar();
        const rsaKey = await this.reqGet("https://static.nid.naver.com/enclogin/keys.nhn")
            .catch((e) => {Log.e(e); return "";}); // RSA Key
        try {
            const keyO = encryptKey(rsaKey, this.username, this._password);
            Log.json("Test",keyO);
        } catch (err) {
            Log.e(err);
        }
        const {key, keyName} = encryptKey(rsaKey, this.username, this._password);
        const form = {
            enctp: 1,
            encnm: keyName,
            svctype: 0,
            "enc_url": "http0X0.0000000000001P-10220.0000000.000000www.naver.com",
            url: "www.naver.com",
            "smart_level": 1,
            encpw: key
        }
        if (captcha != null) {
            form["smart_LEVEL"] = -1;
            form["chptchakey"] = captcha.key; // Not a typo; Naver uses CHptcha
            form["chptcha"] = captcha.value;
            form["captcha_type"] = "image"; // but in this case Naver uses CAptcha
        }
        log("Sending encrypted login request");
        const cookie = this.reqCookie;
        const body:string = await request({
            url: "https://nid.naver.com/nidlogin.login",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "Accept": "text/plain"
            },
            method: "POST",
            form,
            jar: cookie,
        });
        // copy cookie to cookieJar
        try {
            COOKIE_SITES.forEach((v) => {
                const cookies = cookie.getCookies(v);
                for (const _cookie of cookies) {
                    Log.d("Cookie", _cookie.toString());
                    const tCookie = new Cookie();
                    tCookie.key = _cookie.key;
                    tCookie.value = _cookie.value;
                    tCookie.expires = _cookie.expires;
                    tCookie.domain = _cookie.domain;
                    tCookie.path = _cookie.path;
                    tCookie.httpOnly = _cookie.httpOnly;
                    tCookie.secure = _cookie.secure;
                    this.cookieJar.setCookieSync(tCookie, v);
                }
            });
        } catch (err) {
            Log.e(err);
        }
        // check cookie vaild
        const cookieText = this.cookieJar.getCookieStringSync("https://naver.com/");
        if (cookieText.indexOf("NID_AUT") !== -1) {
            log("Successfully logged in");
            this.emit("login");
            return Promise.resolve();
        } else {
            log("Failed to log in");
            // Parse captcha image if it exists
            const captchaes = body.match(/<img id="captchaimg"[\s\S]+?>/im);
            if (captchaes == null || captchaes.length <= 0) {
                return Promise.reject({captcha: false} as LoginError);
            }
            const captchaHTML = captchaes[0];
            const errorCode = {
                captcha: false,
            } as LoginError;
            if (captchaHTML.indexOf("캡차이미지") >= 0) {
                errorCode.captcha = true;
                const pt = captchaHTML.match(/https.+?"/i);
                if (pt != null) {
                    log("Captcha need!");
                    errorCode.captchaURL = pt[0].substring(0,pt[0].lastIndexOf("\""));
                    const url = errorCode.captchaURL;
                    errorCode.captchaKey = url.substring(url.indexOf("key=") + 4, url.lastIndexOf("&"));
                }
            }
            return Promise.reject(errorCode);
        }
    }
    /**
     * Logout credit
     * useless?
     */
    public async logout() {
        this.cookieJar = new CookieJar();
        log("Logging out");
        this.emit("logout");
        return Promise.resolve();
    }
    /**
     * Validate naver login
     * @returns username or Promise.reject() (fail)
     */
    public async validateLogin() {
        const content = this.asJSON(await this.reqGet(`${CHAT_API_URL}/${CHAT_APIS.CHANNEL}?onlyVisible=true`));
        log(JSON.stringify(content));
        if (content == null) {
            // not found.
            return Promise.reject("404 NOT FOUND");
        }
        const errorCode = get(content, "message.error.code", {default: "-1"});
        if (errorCode === "1002") {
            // {"message":{"status":"500","error":{"code":"1002","msg":"로그인이 필요합니다","errorResult":null},"result":null}}
            // 로그인이 필요합니다
            return Promise.reject("1002 NEED LOGIN");
        }
        return errorCode === "200" ? this.username : Promise.reject(`${errorCode} UNKNOWN`);
    }
    /**
     * set Password.
     */
    public set password(value:string) {
        this._password = value;
    }
    public get reqCookie():orgrq.CookieJar {
        const cookie = request.jar();
        for (const url of COOKIE_SITES) {
            this.cookieJar.getCookiesSync(url)
                .forEach((value) => cookie.setCookie(value.toString(), url));
        }
        return cookie;
    }
    /**
     * request get
     * @param url Request URL without ?**=**&**=**
     * @param sub Parmaters (**=**&**=**)
     * @param encoding Encoding
     * @param referer Referer
     */
    public async reqGet(url:string, sub:{[key:string]: string} = {}, encoding = "utf-8", referer = CHAT_HOME_URL) {
        if (url.indexOf("?") >= 0) {
            const parse = this.fromURL(url);
            url = parse.url;
            sub = {
                ...sub,
                ...parse.params,
            };
        }
        const options:request.RequestPromiseOptions | request.OptionsWithUrl = {
            method: "GET",
            url,
            qs: sub,
            agent: this.httpsAgent,
            encoding: encoding === "utf-8" ? encoding : null,
            strictSSL: true,
            headers: {
                "Referer": referer,
            },
            jar: this.reqCookie,
        }
        try {
            const buffer:Buffer | string = await request(options).catch((e) => Log.e(e));
            if (typeof buffer === "string") {
                return Promise.resolve(buffer);
            } else {
                return iconv.convert(buffer, "utf-8", encoding).toString() as string;
            }
        } catch (err) {
            Log.e(err);
            return Promise.resolve(null as string);
        }
    }
    public get export() {
        return JSON.stringify(this.cookieJar.serializeSync());
    }
    public import(cookieStr:string) {
        this.cookieJar = new CookieJar();
        try {
            const r = (this.cookieJar as any).deserializeSync(cookieStr);
            if (r == null) {
                log("Cookie parse:fail");
            }
        } catch {
            log("Cookie parse:fail");
        }
    }
    private asJSON(str:string):object {
        let obj = null;
        try {
            obj = JSON.parse(str);
        } catch {
            // nothing.
        }
        return obj;
    }
    private fromURL(str:string) {
        const out = {
            url: str.indexOf("?") >= 0 ? str.substring(0, str.indexOf("?")) : str,
            params: {} as {[key:string]: string},
        }
        if (str.indexOf("?") >= 0 && str.length > str.indexOf("?") + 1) {
            const params = str.substr(str.indexOf("?") + 1);
            params.split("&").map((v) => {
                if (v.indexOf("=") >= 0) {
                    return [v.split("=")[0], v.split("=")[1]];
                } else {
                    return [v, ""];
                }
            }).forEach(([key,value]) => params[key] = value);
        }
        return out;
    }
}
export interface LoginError {
    captcha:boolean;
    captchaURL?:string;
    captchaKey?:string;
}
function log(str:string) {
    Log.d(str);
}