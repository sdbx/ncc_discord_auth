import * as caller from "caller"
import * as iconv from "encoding"
import { EventEmitter } from "events"
import * as get from "get-value"
import { Agent } from "https"
import * as querystring from "querystring"
import * as orgrq from "request"
import * as request from "request-promise-native"
import { Cookie, CookieJar, parseDate } from "tough-cookie"
import Log from "../../log"
import { CHAT_API_URL, CHAT_APIS, CHAT_HOME_URL, CHATAPI_CHANNELS, COOKIE_SITES } from "../ncconstant"
import { asJSON, parseURL } from "../nccutil"
import encryptKey from "./loginencrypt"

export default class NCredit extends EventEmitter {
    public username:string
    protected _password:string
    protected cookieJar:CookieJar = new CookieJar()
    private httpsAgent = new Agent({
        keepAlive: true
    })
    constructor(username?:string, password?:string) {
        super()
        this.username = username
        this._password = password
    }
    public clear() {
        this.cookieJar = new CookieJar()
    }
    public set(username?:string, password?:string) {
        this.clear()
        if (username != null) {
            this.username = username
        }
        if (password != null) {
            this._password = password
        }
    }
    /**
     * Validate Naver logined.
     * Recommand Caching value
     * @param captcha Naver captcha parameter(check other class for detail)
     * @returns captcha if false
     */
    public async login(captcha:{key:string, value:string} = null) {
        log("Starting logging in")
        log("Creating new cookie jar")
        this.cookieJar = new CookieJar()
        const rsaKey = await this.reqGet("https://static.nid.naver.com/enclogin/keys.nhn")
            .catch((e) => {Log.e(e); return ""}) // RSA Key
        try {
            const keyO = encryptKey(rsaKey, this.username, this._password)
        } catch (err) {
            Log.e(err)
        }
        const {key, keyName} = encryptKey(rsaKey, this.username, this._password)
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
            form["smart_LEVEL"] = -1
            form["chptchakey"] = captcha.key // Not a typo; Naver uses CHptcha
            form["chptcha"] = captcha.value
            form["captcha_type"] = "image" // but in this case Naver uses CAptcha
        }
        log("Sending encrypted login request")
        const cookie = this.reqCookie
        const body:string = await request({
            url: "https://nid.naver.com/nidlogin.login",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "Accept": "text/plain"
            },
            method: "POST",
            form,
            jar: cookie,
        })
        // copy cookie to cookieJar
        try {
            COOKIE_SITES.forEach((v) => {
                const cookies = cookie.getCookies(v)
                for (const _cookie of cookies) {
                    const tCookie = new Cookie()
                    tCookie.key = _cookie.key
                    tCookie.value = _cookie.value
                    tCookie.expires = _cookie.expires
                    tCookie.domain = _cookie.domain
                    tCookie.path = _cookie.path
                    tCookie.httpOnly = _cookie.httpOnly
                    tCookie.secure = _cookie.secure
                    this.cookieJar.setCookieSync(tCookie, v)
                }
            })
        } catch (err) {
            Log.e(err)
        }
        // check cookie valid
        const cookieText = this.cookieJar.getCookieStringSync("https://naver.com/")
        if (cookieText.indexOf("NID_AUT") !== -1) {
            log("Successfully logged in")
            await this.fetchUserID()
            this.emit("login")
            return Promise.resolve()
        } else {
            log("Failed to log in")
            // Parse captcha image if it exists
            const captchaes = body.match(/<img id="captchaimg"[\s\S]+?>/im)
            if (captchaes == null || captchaes.length <= 0) {
                return Promise.reject({captcha: false} as LoginError)
            }
            const captchaHTML = captchaes[0]
            const errorCode = {
                captcha: false,
            } as LoginError
            if (captchaHTML.indexOf("캡차이미지") >= 0) {
                errorCode.captcha = true
                const pt = captchaHTML.match(/https.+?"/i)
                if (pt != null) {
                    log("Captcha need!")
                    errorCode.captchaURL = pt[0].substring(0,pt[0].lastIndexOf("\""))
                    const url = errorCode.captchaURL
                    errorCode.captchaKey = url.substring(url.indexOf("key=") + 4, url.lastIndexOf("&"))
                }
            }
            return Promise.reject(errorCode)
        }
    }
    public async fetchUserID() {
        const home = await this.reqGet(CHAT_HOME_URL)
        const q1 = home.match(/userId.+/i)[0]
        const userid = q1.substring(q1.indexOf("'") + 1, q1.lastIndexOf("'")).trim()
        Log.d("Username", userid)
        this.username = userid
        return userid
    }
    /**
     * Logout credit
     * useless?
     */
    public async logout() {
        this.cookieJar = new CookieJar()
        log("Logging out")
        this.emit("logout")
        return Promise.resolve()
    }
    /**
     * Validate naver login
     * @returns username or Promise.reject() (fail)
     */
    public async validateLogin() {
        const content = asJSON(await this.reqGet(CHATAPI_CHANNELS))
        if (content == null) {
            // not found.
            return Promise.reject("404 NOT FOUND")
        }
        const errorCode = get(content, "message.status", {default: "-1"})
        if (errorCode === "1002") {
            // {"message":{"status":"500","error":{"code":"1002","msg":"로그인이 필요합니다","errorResult":null},"result":null}}
            // 로그인이 필요합니다
            return Promise.reject("1002 NEED LOGIN")
        }
        return errorCode === "200" ? Promise.resolve(this.username) : Promise.reject(`${errorCode} UNKNOWN`)
    }
    /**
     * set Password.
     */
    public set password(value:string) {
        this._password = value
    }
    /**
     * get cookie for request-promise-native
     */
    public get reqCookie():orgrq.CookieJar {
        const cookie = request.jar()
        for (const url of COOKIE_SITES) {
            this.cookieJar.getCookiesSync(url)
                .forEach((value) => cookie.setCookie(value.toString(), url))
        }
        return cookie
    }
    public get accessToken():string {
        const cookies = this.cookieJar.getCookiesSync("https://naver.com/")
        const skey = cookies.filter((value) => value.key === "NID_AUT" || value.key === "NID_SES")
            .map((value) => `${value.key}=${value.value};`).join(" ")
        return skey
    }
    /**
     * request get
     * @param url Request URL without ?**=**&**=** or with **NOT** encoded.
     * @param sub Parmaters (**=**&**=**) **NOT** encoded.
     * @param encoding Encoding
     * @param referer Referer
     */
    public async reqGet(url:string, sub:{[key:string]: string} = {}, referer = CHAT_HOME_URL, encoding = "utf-8") {
        if (url.indexOf("?") >= 0) {
            const parse = parseURL(url)
            url = parse.url
            sub = {
                ...sub,
                ...parse.params,
            }
        }
        return this.req("GET", url, sub, {}, encoding, referer)
    }
    /**
     * request post 
     * @param url Request URL without ?**=**&**=** or with **NOT** encoded.
     * @param sub Parmaters (**=**&**=**) **NOT** encoded.
     * @param postD Form Data
     * @param referer Referer
     * @param encoding Encoding
     */
    public async reqPost(url:string, sub:{[key:string]: string}, postD:{[key:string]: any} = {},
        referer = CHAT_HOME_URL, encoding = "utf-8") {
        if (url.indexOf("?") >= 0) {
            const parse = parseURL(url)
            url = parse.url
            sub = {
                ...sub,
                ...parse.params,
            }
        }
        return this.req("POST", url, sub, postD, encoding, referer)
    }
    // request raw
    public async req(sendType:"POST" | "GET" | "DELETE", url:string,
        sub:{[key:string]: string} = {}, postD:{[key:string]: any} = {},
        encoding = "utf-8", referer = CHAT_HOME_URL) {
        // set origin
        const originRegex = /http(s)?:\/\/.+?\//
        let origin
        if (originRegex.test(referer)) {
            origin = referer.match(originRegex)[0]
        } else {
            origin = referer
        }
        // post data encode
        let post_body = null
        if (sendType === "POST") {
            let convFn:(v:string) => string
            if (encoding === "utf-8") {
                convFn = (v) => encodeURIComponent(v)
            } else {
                convFn = (v) => v
            }
            post_body = iconv.convert(
                querystring.stringify(postD, "&", "=", { encodeURIComponent: convFn }), "utf-8")
        }
        const options:request.RequestPromiseOptions | request.OptionsWithUrl = {
            method: sendType,
            url,
            qs: sub,
            body: post_body,
            agent: this.httpsAgent,
            encoding: encoding === "utf-8" ? encoding : null,
            strictSSL: true,
            headers: {
                "referer": referer,
                "origin": origin,
                "content-type": (sendType === "POST" ? 
                    `application/x-www-form-urlencoded; charset=${encoding}` : undefined)
            },
            jar: this.reqCookie,
        }
        try {
            const buffer:Buffer | string = await request(options).catch((e) => Log.e(e))
            if (typeof buffer === "string") {
                return Promise.resolve(buffer)
            } else {
                return iconv.convert(buffer, "utf-8", encoding).toString() as string
            }
        } catch (err) {
            Log.e(err)
            return Promise.resolve(null as string)
        }
    }
    public get export() {
        return JSON.stringify(this.cookieJar.serializeSync(), null, "\t")
    }
    public import(cookieStr:string) {
        try {
            this.cookieJar = CookieJar.deserializeSync(cookieStr)
        } catch {
            log("Cookie parse:fail")
        }
    }
}
export interface LoginError {
    captcha:boolean;
    captchaURL?:string;
    captchaKey?:string;
}
function log(str:string) {
    Log.d(str)
}