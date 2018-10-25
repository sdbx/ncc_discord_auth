import caller from "caller"
import * as crypto from "crypto"
import * as iconv from "encoding"
import { EventEmitter } from "events"
import get from "get-value"
import { Agent } from "https"
import * as querystring from "querystring"
import * as orgrq from "request"
import request from "request-promise-native"
import { Stream } from "stream"
import { Cookie, CookieJar, parseDate } from "tough-cookie"
import Cache from "../../cache"
import Log from "../../log"
import NCaptcha from "../ncaptcha"
import { CHAT_HOME_URL, CHATAPI_PHOTO_SESSION_KEY, COOKIE_CORE_SITES, COOKIE_EXT_SITES } from "../ncconstant"
import { asJSON, parseURL } from "../nccutil"
import encryptKey from "./loginencrypt"

const likepost = ["POST", "PUT"]
const consumerKey = "kqbJYsj035JR"
const signKey = "4EE81426ewcSpNzbjul1"

/**
 * Core Naver authorization library
 * 
 * Original: https://github.com/yoo2001818/node-ncc-es6/blob/master/src/credentials.js
 */
export default class NCredit extends EventEmitter {
    /**
     * Naver id
     */
    public username:string
    /**
     * Keep-alive login state in cookie
     * 
     * as same as `로그인 상태 유지` in naver
     */
    public keepLogin = false
    /**
     * Naver password (This can be **null**)
     */
    protected _password:string
    /**
     * Naver auth's cookie
     */
    protected cookieJar:CookieJar
    /**
     * Auth token.
     */
    protected authToken:string
    /**
     * Request Cookie
     */
    protected requestCookie:orgrq.CookieJar
    /**
     * Https keep-Alive
     */
    private httpsAgent:Map<string, BAgent>
    private urlTimestamp:Map<string, number>
    /**
     * Create NCredit with id, password
     * 
     * No matter parameter when login to OTP
     * @param username 
     * @param password 
     */
    constructor(username?:string, password?:string) {
        super()
        this.set(username, password)
        this.urlTimestamp = new Map()
        this.httpsAgent = new Map()
    }
    /**
     * Clear cookie
     * 
     * It doesn't clear username and password.
     */
    public clear() {
        this.cookieJar = new CookieJar()
    }
    /**
     * Set username and password to login
     * @param username Naver ID
     * @param password Naver PW
     */
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
     * 
     * Recommend Catching value
     * @param captcha Naver captcha parameter(check other class for detail)
     * @returns resolve when SUCCESS / reject {@link LoginError} when error
     */
    public async login(captcha:{key:string, value:string} = null) {
        log("Starting logging in")
        log("Creating new cookie jar")
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
            encpw: key,
            nvlong: this.keepLogin ? "on" : "off",
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
              "Referer": "https://www.naver.com/",
              "User-Agent": "Mozilla/5.0 (Nodejs) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.0.0 Safari/537.36",
            },
            method: "POST",
            form,
            jar: cookie,
        })
        // check cookie valid
        const cookieText = cookie.getCookieString("https://naver.com/")
        if (cookieText.indexOf("NID_AUT") !== -1) {
            log("Successfully logged in")
            let userid:string
            try {
                await this.updateLogin(true, cookie)
                userid = await this.fetchUserID()
            } catch {
                await this.updateLogin(false)
                return Promise.reject({captcha: false} as LoginError)
            }
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
     * @returns userid if SUCCESS / null if FAIL (resolve)
     */
    public async loginOTP(otpcode:number | string) {
        const code = typeof otpcode === "number" ? otpcode.toString().padStart(8) : otpcode
        const form = {
            enctp: 2,
            svctype: 0,
            viewtype: 0,
            locale: "ko_KR",
            smart_LEVEL: 1,
            url: "https://nid.naver.com/nidlogin.login?mode=number",
            mode: "number",
            key: code,
            nvlong: this.keepLogin ? "on" : "off",
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
        // check cookie valid
        const cookieText = cookie.getCookieString("https://naver.com")
        if (cookieText.indexOf("NID_AUT") !== -1) {
            log("Successfully logged in")
            await this.updateLogin(true, cookie)
            const uid = await this.fetchUserID()
            this.emit("login")
            return uid
        } else {
            log("Fail. Check and retry code.")
            return null
        }
    }
    /**
     * Get userid for logined by cookie
     */
    public async fetchUserID() {
        const home = await this.reqGet(CHAT_HOME_URL) as string
        const q = home.match(/userId.+/i)
        if (q == null) {
            return Promise.reject(new Error("Not Logined!"))
        }
        const q1 = q[0]
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
        const url = `https://nid.naver.com/nidlogin.logout?returl=https://talk.cafe.naver.com/`
        await this.reqGet(url) // useless maybe?
        // empty cookie
        await this.updateLogin(false)
        log("Logging out")
        this.emit("logout")
        return Promise.resolve()
    }
    /**
     * Validate naver login
     * @returns username or null (fail)
     */
    public async validateLogin(throwCause = false) {
        const content = asJSON(await this.reqGet(CHATAPI_PHOTO_SESSION_KEY) as string)
        const rej = (cause:string) => {
            Log.w("Valid-Login", cause)
            return throwCause ? Promise.reject(cause) : Promise.resolve(null as string)
        }
        if (content == null) {
            // not found.
            return rej("404 NOT FOUND")
        }
        const errorCode = get(content, "message.status", {default: "-1"})
        if (errorCode === "1002") {
            // {"message":{"status":"500","error":{"code":"1002","msg":"로그인이 필요합니다","errorResult":null},"result":null}}
            return rej("1002 NOT FOUND")
        }
        if (errorCode === "200") {
            return Promise.resolve(this.username)
        } else {
            return rej(`${errorCode} UNKNOWN`)
        }
    }
    /**
     * Generate OTP
     * 
     * token: 8-diget token **number**
     */
    public async genOTP() {
        const oauthURL = "https://nid.naver.com/naver.oauth"
        const timestamp = Math.floor(Date.now() / 1000)
        const basicParam = {
            mode: "req_req_token",
            oauth_callback: "https://nid.naver.com/com.nhn.login_global/inweb/finish",
            oauth_consumer_key: consumerKey,
            oauth_nonce: NCaptcha.randomString(20).replace(/0/g, "1"),
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
            token: Number.parseInt(json["number"] as string),
            expires: new Date(
                (Number.parseInt(json["timestamp"], 10) + Number.parseInt(json["expires_in"], 10)) * 1000),
            naverID: json["id"] as string
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
        if (this.requestCookie == null) {
            return request.jar()
        } else {
            return this.requestCookie
        }
    }
    /**
     * get Naver-auth token for parameter
     * 
     * NID_AUT & NID_SES
     */
    public get accessToken():string {
        return this.authToken
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
    /**
     * request (REST API)
     * @param sendType REST API type
     * @param url Request URL without ?**=**&**=** or with **NOT** encoded.
     * @param sub Parmaters (**=**&**=**) **NOT** encoded.
     * @param postD Form Data
     * @param referer Referer
     * @param encoding Receive Encoding
     */
    public async req(sendType:"POST" | "GET" | "DELETE" | "PUT", url:string,
        sub:{[key:string]: string | number | boolean} = {}, postD:{[key:string]: any} = {},
        referer = CHAT_HOME_URL, encoding = "utf-8") {
        // set origin
        const originRegex = /http(s)?:\/\/.+?\//
        let origin:string
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
        // check post type
        const likePost = likepost.indexOf(sendType) >= 0
        let binary = false
        if (likePost) {
            const deepCheck = (obj) => {
                for (const value of Object.values<any>(obj)) {
                    if (value == null) {
                        continue
                    }
                    if (value instanceof Buffer || value instanceof Stream) {
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
        if (!this.httpsAgent.has(origin)) {
            this.httpsAgent.set(origin, {
                using: false,
                agent: new Agent({keepAlive: true, keepAliveMsecs: 120000}),
            })
        }
        const agent_pair = this.httpsAgent.get(origin)
        const cookie = this.reqCookie
        const options:request.RequestPromiseOptions | request.OptionsWithUrl = {
            method: sendType,
            url,
            qs: sub,
            useQuerystring: true,
            form: likePost && !binary ? postD : undefined,
            formData: binary ? postD : undefined,
            agent: agent_pair.using ? null : agent_pair.agent,
            encoding: encoding.toLowerCase() === "utf-8" ? encoding : null,
            strictSSL: true,
            timeout: 5000,
            headers: {
                // "cache-control": "no-cache, no-store, max-age=0",
                "referer": referer,
                "origin": origin,
            },
            jar: cookie,
        }
        const bf = Date.now()
        agent_pair.using = true
        let buffer:Buffer | string
        try {
            buffer = await request(options)
        } catch (err) {
            try {
                options.agent = null
                buffer = await request(options)
            } catch (err2) {
                Log.e(err2)
                agent_pair.using = false
                return Promise.resolve(null as string)
            } finally {
                Log.e(err)
            }
        }
        agent_pair.using = false
        if (!this.urlTimestamp.has(_url) || this.urlTimestamp.get(_url) + 5000 < Date.now()) {
            Log.url("Fetch URL", _url, from + " - " + (Date.now() - bf))
            this.urlTimestamp.set(_url, Date.now())
        }
        this.saveCookie(COOKIE_EXT_SITES, cookie)
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
    public async import(cookieStr:string) {
        try {
            this.cookieJar = CookieJar.deserializeSync(cookieStr)
            const cookie = request.jar()
            for (const url of COOKIE_CORE_SITES) {
                this.cookieJar.getCookiesSync(url)
                    .forEach((value) => cookie.setCookie(value.toString(), url))
            }
            this.requestCookie = cookie
            if (await this.validateLogin(false) == null) {
                return this.updateLogin(false)
            } else {
                return this.updateLogin(true)
            }
        } catch {
            log("Cookie parse:fail")
        }
        return
    }
    /**
     * Check cookie exists.
     * @param url Cookie's URL
     * @param key Cookie's key
     */
    public hasCookie(url:string, key?:string) {
        const cookies = this.cookieJar.getCookiesSync(url)
        if (cookies.length < 0) {
            return false
        } else if (key == null) {
            return true
        }
        for (const cookie of cookies) {
            if (cookie.key === key) {
                return true
            }
        }
        return false
    }
    private async updateLogin(logined:boolean, cookie?:orgrq.CookieJar) {
        if (logined) {
            /**
             * Case: Update cookie via this function.
             */
            if (cookie != null) {
                if (await this.validateLogin(false) != null) {
                    // logout first.
                    await this.logout()
                }
                this.cookieJar = new CookieJar()
                this.cookieJar.setCookieSync(this.nnbCookie, "https://naver.com/")
                this.cookieJar.setCookieSync(this.entcpCookie, "https://nid.naver.com/") // not need but..
                // copy cookie to cookieJar
                this.saveCookie(COOKIE_CORE_SITES, cookie)  
                this.requestCookie = cookie 
            }
            // for ncc-socket
            const cookieNaver = this.cookieJar.getCookiesSync("https://naver.com/")
            this.authToken = cookieNaver.filter(
                (value) => value.key === "NID_AUT" || value.key === "NID_SES"
            ).map((value) => `${value.key}=${value.value};`).join(" ")
            Log.d("Cookie Set!")
        } else if (!logined) {
            this.cookieJar = new CookieJar()
            this.authToken = null
            this.requestCookie = null
        }
        return Promise.resolve()
    }
    /**
     * Generate NNB cookie
     * 
     * Naver captcha **REQUIRES** this cookie
     */
    private get nnbCookie() {
        const nnbCookie = new Cookie()
        nnbCookie.key = "NNB"
        nnbCookie.value = NCaptcha.randomString(11).toUpperCase()
        nnbCookie.path = "./"
        nnbCookie.domain = "naver.com"
        nnbCookie.expires = new Date(2050, 11, 30)
        return nnbCookie
    }
    /**
     * Generate Entcp Cookie
     * 
     * Need..?
     */
    private get entcpCookie() {
        const entcpCookie = new Cookie()
        entcpCookie.key = "nid_enctp"
        entcpCookie.value = "1"
        entcpCookie.path = "./"
        entcpCookie.domain = "nid.naver.com"
        entcpCookie.expires = new Date(2050, 11, 30)
        return entcpCookie
    }
    /**
     * Save cookie(request) to CookieJar
     * @param sites Save sites
     * @param cookie Request Cookie
     */
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
interface BAgent {
    using:boolean;
    agent:Agent
}
/**
 * Response of naver login
 */
export interface LoginError {
    captcha:boolean;
    captchaURL?:string;
    captchaKey?:string;
}
/**
 * Kkiro's log
 * @param str string
 */
function log(str:string) {
    Log.d(str)
}