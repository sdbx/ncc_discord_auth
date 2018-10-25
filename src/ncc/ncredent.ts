import chalk, { Chalk } from "chalk"
import { EventEmitter } from "events"
import * as fs from "fs-extra"
import * as path from "path"
import * as read from "read"
import request from "request-promise-native"
import { CookieJar } from "tough-cookie"
import * as util from "util"
import Cache from "../cache"
import Config from "../config"
import Log from "../log"
import NCredit, { LoginError } from "./credit/ncredit"
import NCaptcha from "./ncaptcha"

const setTimeoutP = util.promisify(setTimeout)

/**
 * Naver authorization
 * 
 * A Wrapper of NCredit
 */
export default class NcCredent extends EventEmitter {
    /**
     * Cache end, 12 Hours.
     */
    public cacheEnds = 43200
    protected credit:NCredit
    protected readonly cookiePath
    private logined:Cache<boolean>
    constructor() {
        super()
        this.credit = new NCredit("id","pw")
        this.cookiePath = path.resolve(Config.dirpath,"choco.cookie")
        this.logined = new Cache(false,-1)
    }
    /**
     * This is not mean "auth is vaild.".
     * But it means buffer!
     */
    protected get available():boolean {
        return this.logined.value
    }
    /**
     * Naver ID
     */
    public get username():string {
        return this.credit.username
    }
    /**
     * Keep login state? (naver option)
     */
    public set keepLogin(value:boolean) {
        this.credit.keepLogin = value
    }
    /**
     * Check logined (Cached or fetch)
     */
    public async availableAsync():Promise<boolean> {
        if (this.logined.expired) {
            return await this.validateLogin() != null
        } else {
            return this.available
        }
    }
    /**
     * Validate login
     * @param ignoreCache Ignore cache?
     * @returns naver username or null(error)
     */
    public async validateLogin(ignoreCache = false):Promise<string> {
        if (!ignoreCache && !this.logined.expired) {
            return this.available ? this.username : null
        }
        const username:string = await this.credit.validateLogin().catch(() => null)
        this.logined = new Cache(username != null, this.cacheEnds)
        return username
    }
    /**
     * make captcha from console
     * 
     * Require **LOGIN**
     */
    public async genCaptchaByConsole() {
        const captcha = await NCaptcha.gen(this.credit)
        // Log.i("Captcha URL", captcha.url)
        await Log.image(captcha.url, "Captcha")
        const captchaRead = await Log.read("Captcha", { hide: false, logResult: true }).catch(() => "")
        captcha.value = captchaRead
        return captcha
    }
    /**
     * get credentials from console
     * @returns naver username or null(error)
     */
    public async genCreditByConsole():Promise<string> {
        const username = await Log.read("Username",{hide:false, logResult:true}).catch(() => "id")
        let password = await Log.read("Password",{hide:true, logResult:false}).catch(() => "__")
        let result:string | LoginError
        let first = true
        let captcha = null
        do {
            try {
                result = await this.login(username, password, captcha)
            } catch (err) {
                result = err
            }
            if (result == null) {
                // wtf.
                return Promise.resolve(null)
            }
            if (typeof result === "string") {
                return Promise.resolve(result)
            }
            // error handling
            if (result.captcha) {
                await Log.image(result.captchaURL, "Captcha-Login",
                    "When you can't verify captcha, Please click below link.")
                if (!first) {
                    password = await Log.read("Password",{hide:true, logResult:false}, password).catch(() => "__")
                }
                const captchaRead = await Log.read("Captcha", {hide:false, logResult: true}).catch(() => "")
                captcha = {
                    key: result.captchaKey,
                    value: captchaRead,
                }
                first = false
            } else {
                return Promise.resolve(null)
            }
        } while (true)
    }
    /**
     * get credentials from userid and password
     * @returns naver username or null(error)
     * @param username naver id
     * @param password naver passwork(unencrypt) - null if username is OTP
     */
    public async login(username:string,password:string,
            captcha?:{key:string,value:string}):Promise<string> {
        let errorCode:LoginError = null
        let uname:string = null
        if (password == null) {
            uname = await this.credit.loginOTP(username)
        } else {
            this.credit.set(username, password)
            uname = await this.credit.login(captcha).catch((err:LoginError) => { errorCode = err; return null})
        }
        if (errorCode != null) {
            return Promise.reject(errorCode)
        }
        const name = uname == null ? null : await this.validateLogin(true)
        // this.credit.password = "__";
        if (name != null) {
            this.credit.username = name
            this.onLogin(name)
        } else {
            this.logined.revoke(false)
        }
        return Promise.resolve(name)
    }
    /**
     * Send Logout to naver
     */
    public async logout() {
        await this.onLogout()
        this.logined.revoke(false)
        await this.credit.logout() // empty cookie
        return Promise.resolve()
    }
    /**
     * Refresh cookie via OTP
     * 
     * 개꿀잼몰카
     * 
     * @param minDelay Delay before login (0 ~ 60) - Blocking unexpected request
     * @returns Resolve when success, reject when fail
     */
    public async refresh(minDelay = 0) {
        if (await this.validateLogin(true) == null) {
            return Promise.reject("Refresh Failed. Cause: Not logined.")
        }
        const backupJar = this.credit.export
        try {
            const otp = await this.credit.genOTP().catch(Log.e)
            if (otp == null) {
                return Promise.reject("Wrong OTP Result.")
            }
            if (otp.expires.getTime() + 1000 < Date.now()) {
                return Promise.reject("Timestamp fail.")
            }
            const delay = Math.min(minDelay * 1000, Math.max(otp.expires.getTime() - Date.now() - 10000, 0))
            Log.d("OTP", "OTP Code: " + otp.token + "\nExpirer: " + new Date(otp.expires) +
                "\nDelay: " + Math.floor(delay / 100))
            this.logined.revoke(false)
            // wait delay
            if (delay > 0) {
                await setTimeoutP(delay)
            }
            // logout
            await this.logout()
            // login with otp
            await this.loginOTP(otp.token)
            return Promise.resolve()
        } catch (err) {
            Log.e(err)
            // await this.credit.fetchUserID().catch(Log.e)
            return Promise.reject("Unknown")
        }
    }
    /**
     * get credentials from Naver OTP code
     * 
     * OTP gen: Naver Cafe APP
     * @param otpcode 8-digit
     * @returns naver username or null(error)
     */
    public async loginOTP(otpcode:number | string) {
        const code = typeof otpcode === "number" ? otpcode.toString().padStart(8, "0") : otpcode
        return this.login(code, null)
    }
    /**
     * Generates OTP
     * 
     * Token: **Number** 
     * 
     * To Use, `<token>.toString().padStart(8, "0")`
     */
    public async genOTP() {
        if (await this.validateLogin() == null) {
            return Promise.reject("Not Logined")
        }
        return this.credit.genOTP()
    }
    /**
     * load credit from cookie
     * 
     * @param manualCookie Manually loaded cookiestr
     * 
     * @returns naver username or null(error)
     */
    public async loadCredit(manualCookie:string = null):Promise<string> {
        this.credit.clear()
        let cookieStr:string
        if (manualCookie == null) {
            cookieStr = await fs.readFile(this.cookiePath, "utf-8").catch(() => null)
            if (cookieStr == null) {
                return Promise.resolve(null)
            }
        } else {
            cookieStr = manualCookie
        }
        try {
            await this.credit.import(cookieStr)
        } catch (err) {
            await fs.remove(this.cookiePath) 
            Log.e(err)
            return Promise.resolve(null)
        }
        const valid:string = await this.validateLogin().catch((err) => null)
        let userid:string = null
        if (valid != null) {
            userid = await this.credit.fetchUserID().catch(Log.e)
            if (userid != null) {
                this.onLogin(userid)
                return userid
            }
        }
        this.logined.revoke(false)
        return valid
    }
    /**
     * onLogin Do
     * @param username username
     */
    protected async onLogin(username:string):Promise<void> {
        Log.i("Runtime-ncc",`Logined by ${username}.`)
        this.logined = new Cache(true, this.cacheEnds)
        await fs.writeFile(this.cookiePath, this.credit.export)
        this.emit("login", username)
        return Promise.resolve()
    }
    /**
     * onLogout do
     */
    protected async onLogout():Promise<void> {
        return Promise.resolve()
    }
}