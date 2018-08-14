import * as caller from "caller"
import * as crypto from "crypto"
import * as iconv from "encoding"
import { EventEmitter } from "events"
import * as get from "get-value"
import { Agent } from "https"
import * as querystring from "querystring"
import * as orgrq from "request"
import * as request from "request-promise-native"
import { Cookie, CookieJar, parseDate } from "tough-cookie"
import Cache from "../../cache"
import Log from "../../log"
import NCaptcha from "../ncaptcha"
import { CHAT_HOME_URL, CHATAPI_PHOTO_SESSION_KEY, COOKIE_SITES } from "../ncconstant"
import { asJSON, parseURL } from "../nccutil"
import encryptKey from "./loginencrypt"

const likepost = ["POST", "PUT"]
const consumerKey = "kqbJYsj035JR"
const signKey = "4EE81426ewcSpNzbjul1"

export default class NCredit extends EventEmitter {
    public username:string
    protected _password:string
    protected cookieJar:CookieJar = new CookieJar()
    private httpsAgent:Cache<Agent>
    constructor(username?:string, password?:string) {
        super()
        this.username = username
        this._password = password
        this.httpsAgent = new Cache((old) => {
            if (old != null) {
                old.destroy()
            }
            return new Agent({
                keepAlive: true
            })
        }, 60)
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
     * @returns captcha if false (Promise.reject)
     */
    public async login(captcha:{key:string, value:string} = null) {
        log("Starting logging in")
        log("Creating new cookie jar")
        this.cookieJar = new CookieJar()
        const rsaKey = await this.reqGet("https://nid.naver.com/login/ext/keys.nhn")
            .catch((e) => {Log.e(e); return ""}) as string // RSA Key
        let keyO
        try {
            keyO = encryptKey(rsaKey, this.username, this._password)
        } catch (err) {
            Log.e(err)
            return null
        }
        const { key, keyName } = keyO
        const form = {
            enctp: 1,
            encnm: keyName,
            svctype: 0,
            "enc_url": "http0X0.0000000000001P-10220.0000000.000000www.naver.com",
            url: "https://www.naver.com",
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
              "Accept": "text/plain",
              "Referer": "https://nid.naver.com/nidlogin.login"
            },
            method: "POST",
            form,
            jar: cookie,
        })
        this.cookieJar.setCookieSync(this.nnbCookie, "https://naver.com/")
        // copy cookie to cookieJar
        this.saveCookie(COOKIE_SITES, cookie)
        // check cookie valid
        const cookieText = this.cookieJar.getCookieStringSync("https://naver.com/")
        if (cookieText.indexOf("NID_AUT") !== -1) {
            log("Successfully logged in")
            const userid = await this.fetchUserID()
            this.emit("login")
            return Promise.resolve(userid)
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
    /**
     * Login via Naver OTP code
     * @param otpcode otpcode
     * @returns userid if success / null if fail (resolve)
     */
    public async loginOTP(otpcode:number | string) {
        const code = typeof otpcode === "number" ? otpcode.toString().padStart(8) : otpcode
        const form = {
            enctp: 2,
            svctype: 0,
            viewtype: 0,
            locale: "ko_KR",
            smart_LEVEL: 1,
            url: "https://www.naver.com",
            mode: "number",
            key: code,
        }
        const cookie = this.reqCookie
        const body:string = await request({
            url: "https://nid.naver.com/nidlogin.login",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Accept": "text/plain",
                "Referer": "https://nid.naver.com/nidlogin.login"
            },
            method: "POST",
            form,
            jar: cookie,
        })
        this.cookieJar.setCookieSync(this.nnbCookie, "https://naver.com/")
        // copy cookie to cookieJar
        this.saveCookie(COOKIE_SITES, cookie)
        // check cookie valid
        const cookieText = this.cookieJar.getCookieStringSync("https://naver.com/")
        if (cookieText.indexOf("NID_AUT") !== -1) {
            log("Successfully logged in")
            const uid = await this.fetchUserID()
            this.emit("login")
            return uid
        } else {
            log("Fail. Check and retry code.")
            return null
        }
    }
    /**
     * Get userid even if logined by cookie
     */
    public async fetchUserID() {
        const home = await this.reqGet(CHAT_HOME_URL) as string
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
        const content = asJSON(await this.reqGet(CHATAPI_PHOTO_SESSION_KEY) as string)
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
     * Gen OTP
     * 
     * token: 8-diget token number
     * expires: When expire otp
     * naverID: ?
     */
    public async genOTP() {
        const oauthURL = "https://nid.naver.com/naver.oauth"
        const timestamp = Math.floor(Date.now() / 1000)
        const basicParam = {
            mode: "req_req_token",
            oauth_callback: "https://nid.naver.com/com.nhn.login_global/inweb/finish",
            oauth_consumer_key: consumerKey,
            oauth_nonce: NCaptcha.randomString(20, false).replace(/0/g, "1"),
            oauth_signature_method: "HMAC_SHA1",
            oauth_timestamp: timestamp,
            use: "number",
        }
        const paramQuery = querystring.stringify(basicParam, "&", "=")
        const signValue = `GET&${
            encodeURIComponent("https://nid.naver.com/naver.oauth")
        }&${encodeURIComponent(paramQuery)}`
        const crypter = crypto.createHmac("sha1", encodeURIComponent(signKey) + "&")
        crypter.write(Buffer.from(signValue, "utf8"))
        crypter.end()
        const signature = (crypter.read() as Buffer).toString("base64")
        const sendParam = {
            ...basicParam,
            oauth_signature: signature,
        }
        const str = await this.reqGet(oauthURL, sendParam) as string
        let json:object
        try {
            if (str == null) {
                return null
            }
            json = JSON.parse(str)
            if (json["stat"] !== "SUCCESS") {
                return null
            }
        } catch (err) {
            Log.e(err)
            return null
        }
        return {
            token: (json["number"] as string).padStart(8, "0"),
            expires: new Date(
                (Number.parseInt(json["timestamp"], 10) + Number.parseInt(json["expires_in"], 10)) * 1000),
            naverID: json["id"]
        }
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
     * @param referer Referer
     * @param encoding Receive Encoding
     */
    public async reqGet(url:string, sub:{[key:string]: string | number | boolean} = {},
        referer = CHAT_HOME_URL, encoding = "utf-8") {
        if (url.indexOf("?") >= 0) {
            const parse = parseURL(url)
            url = parse.url
            sub = {
                ...sub,
                ...parse.params,
            }
        }
        return this.req("GET", url, sub, {}, referer, encoding)
    }
    /**
     * request post 
     * @param url Request URL without ?**=**&**=** or with **NOT** encoded.
     * @param sub Parmaters (**=**&**=**) **NOT** encoded.
     * @param postD Form Data
     * @param referer Referer
     * @param encoding Receive Encoding
     */
    public async reqPost(url:string, sub:{[key:string]: string | number | boolean} = {}, postD:{[key:string]: any} = {},
        referer = CHAT_HOME_URL,  encoding = "utf-8") {
        if (url.indexOf("?") >= 0) {
            const parse = parseURL(url)
            url = parse.url
            sub = {
                ...sub,
                ...parse.params,
            }
        }
        return this.req("POST", url, sub, postD, referer, encoding)
    }
    // request raw
    public async req(sendType:"POST" | "GET" | "DELETE" | "PUT", url:string,
        sub:{[key:string]: string | number | boolean} = {}, postD:{[key:string]: any} = {},
        referer = CHAT_HOME_URL, encoding = "utf-8") {
        // set origin
        const originRegex = /http(s)?:\/\/.+?\//
        let origin
        if (originRegex.test(referer)) {
            origin = referer.match(originRegex)[0]
        } else {
            origin = referer
        }
        let _url = querystring.stringify(sub, "&", "=")
        _url = url + ((_url.length > 0) ? "?" + _url : "")
        let from = caller()
        if (from != null) {
            from = from.substr(from.lastIndexOf("/") + 1)
        }
        Log.url("Fetch URL", _url, from)
        // check post type
        const likePost = likepost.indexOf(sendType) >= 0
        let binary = false
        if (likePost) {
            const deepCheck = (obj) => {
                for (const value of Object.values<any>(obj)) {
                    if (value == null) {
                        continue
                    }
                    if (value instanceof Buffer) {
                        return true
                    }
                    if (typeof value === "object") {
                        return deepCheck(value)
                    }
                    if (["number", "boolean", "string"].indexOf(typeof value) < 0) {
                        return true
                    }
                }
                return false
            }
            binary = deepCheck(postD)
        }
        // refresh httpsAgent
        if (this.httpsAgent.expired) {
            this.httpsAgent.doRefresh()
        }
        const jar = this.reqCookie
        const options:request.RequestPromiseOptions | request.OptionsWithUrl = {
            method: sendType,
            url,
            qs: sub,
            useQuerystring: true,
            form: likePost && !binary ? postD : undefined,
            formData: binary ? postD : undefined,
            agent: this.httpsAgent.value,
            encoding: encoding.toLowerCase() === "utf-8" ? encoding : null,
            strictSSL: true,
            headers: {
                // "cache-control": "no-cache, no-store, max-age=0",
                "referer": referer,
                "origin": origin,
            },
            jar,
        }
        // this.saveCookie(COOKIE_SITES, jar)
        try {
            const buffer:Buffer | string = await request(options)
            if (typeof buffer === "string") {
                // utf-8 encoded
                return Promise.resolve(buffer)
            } else {
                // binary test?
                if (encoding != null) {
                    // to string
                    return iconv.convert(buffer, "utf-8", encoding).toString() as string
                } else {
                    // binary
                    return buffer
                }
            }
        } catch (err) {
            this.httpsAgent.doRefresh()
            Log.e(err)
            return Promise.resolve(null as string)
        }
    }
    /**
     * Export cookie to string
     */
    public get export() {
        return JSON.stringify(this.cookieJar.serializeSync(), null, "\t")
    }
    /**
     * Import from cookieJar JSON
     * @param cookieStr 
     */
    public import(cookieStr:string) {
        try {
            this.cookieJar = CookieJar.deserializeSync(cookieStr)
        } catch {
            log("Cookie parse:fail")
        }
    }
    /**
     * Generate NNB cookie
     * 
     * Naver captcha **REQUIRES** this cookie
     */
    private get nnbCookie() {
        const nnbCookie = new Cookie()
        nnbCookie.key = "NNB"
        nnbCookie.value = NCaptcha.randomString(11, true)
        nnbCookie.path = "./"
        nnbCookie.domain = "naver.com"
        nnbCookie.expires = new Date(2050, 11, 30)
        return nnbCookie
    }
    private saveCookie(sites:string[], cookie:orgrq.CookieJar) {
        try {
            sites.forEach((v) => {
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
                    tCookie.expires = new Date(2050, 11, 30)
                    this.cookieJar.setCookieSync(tCookie, v)
                }
            })
        } catch (err) {
            Log.e(err)
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