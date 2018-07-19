import chalk, { Chalk } from "chalk";
import * as fs from "fs-extra";
import Session, { Credentials } from "node-ncc-es6";
import * as path from "path";
import * as read from "read";
import * as request from "request-promise-native";
import { CookieJar } from "tough-cookie";
import Config from "../config";
import Log from "../log";

export default class NcCredent {
    protected credit:Credentials;
    protected readonly cookiePath;
    private lastLogin:number;
    constructor() {
        this.credit = new Credentials("id","pw");
        this.cookiePath = path.resolve(Config.dirpath,"choco.cookie");
        this.lastLogin = -1;
    }
    /**
     * This is not mean "auth is vaild.".
     * But it means buffer!
     */
    public get available():boolean {
        return Date.now() - this.lastLogin <= 3600000;
    }
    public get username():string {
        return this.credit.username;
    }
    public async availableAsync():Promise<boolean> {
        return Promise.resolve(this.available || await this.validateLogin() != null);
    }
    /**
     * Validate login
     * @returns naver username or null(error)
     */
    public async validateLogin():Promise<string> {
        return this.credit.validateLogin().then((u) => u).catch(() => null);
    }
    /**
     * get credentials from console
     * @returns naver username or null(error)
     */
    public async genCreditByConsole():Promise<string> {
        const username = await Log.read("Username",{hide:false, logResult:true}).catch(() => "id");
        const password = await Log.read("Password",{hide:true, logResult:false}).catch(() => "__");
        return this.requestCredent(username,password).catch((err:LoginError) => null);
    }
    /**
     * get credentials from userid and password
     * @returns naver username or null(error)
     * @param username naver id
     * @param password naver passwork(unencrypt)
     */
    public async requestCredent(username:string,password:string,
            captcha?:{key:string,value:string}):Promise<string> {
        this.credit = new Credentials(username,password);
        let errorCase:string = null;
        await this.credit.login(captcha).catch((err:Error) => errorCase = err.message);
        if (errorCase != null) {
            const errorCode = {
                pwd: false,
                captcha: false,
            } as LoginError;
            if (errorCase.indexOf("Invalid username or password") >= 0) {
                errorCode.pwd = true;
            }
            if (errorCase.indexOf("캡차이미지") >= 0) {
                errorCode.captcha = true;
                const pt = errorCase.match(/https.+?"/i);
                if (pt != null) {
                    errorCode.captchaURL = pt[0].substring(0,pt[0].lastIndexOf("\""));
                }
            }
            return Promise.reject(errorCode);
        }
        const name = await this.validateLogin();
        this.credit.password = "__";
        if (name != null) {
            this.credit.username = name;
            await fs.writeFile(this.cookiePath, JSON.stringify(this.credit.getCookieJar()));
            await this.onLogin(name);
        } else {
            this.lastLogin = -1;
        }
        return Promise.resolve(name);
    }
    /**
     * load credit from cookie
     * @returns naver username or null(error)
     */
    public async loadCredit():Promise<string> {
        this.credit = new Credentials("id", "pw");
        const cookieStr:string = await fs.readFile(this.cookiePath, "utf-8").catch(() => null);
        if (cookieStr == null) {
            return Promise.resolve(null);
        }
        try {
            this.credit.setCookieJar(JSON.parse(cookieStr));
        } catch (err) {
            await fs.remove(this.cookiePath); 
            Log.e(err);
            return Promise.resolve(null);
        }
        const result:string = await this.validateLogin();
        if (result != null) {
            this.credit.username = result;
            // await fs.writeFile(this.cookiePath, JSON.stringify(this.credit.getCookieJar()));
            await this.onLogin(result);
        } else {
            this.lastLogin = -1;
        }
        return Promise.resolve(result);
    }
    protected async onLogin(username:string):Promise<void> {
        return Promise.resolve();
    }
    /*
    public async login():Promise<Session> {
        let name;
        name = await this.loadCredit();
        if (name == null) {
            do {
                name = await this.genCreditByConsole();
            } while (name == null);
        }
        console.log(`Username: ${name}`);
        this.session = new Session(this.credit);
        await this.session.connect();
        return Promise.resolve(this.session);
    }
    */
    private read(prompt:string,silent:boolean):Promise<string> {
        return new Promise((res,rej) => {
            read({prompt:"", silent},(err, pw:string) => err != null ? rej(err) : res(pw));
        });
    }
}
export interface LoginError {
    pwd:boolean;
    captcha:boolean;
    captchaURL?:string;
}