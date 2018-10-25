import * as fs from "fs-extra"
import Long from "long"
import * as path from "path"
import Log from "./log"

export default class Config {
    public static readonly appVersion:number = 2 // app version
    // tslint:disable-next-line
    private static readonly excludes:string[] = [
        // "appVersion,defaultblacklist,saveTo,blacklist,dirpath,configName,name,subCode,sub";
        "appVersion",
        "blacklist",
        "configName",
        "subCode",
        "saveTo",
        "dirpath",
        "sub",
        "name",
    ]
    public version:number // config version
    /*
    public discordID:IDiscordID = {articleChannels:[]} as any;
    public cafe:ICafe = {} as any;
    public game:Game = new Game();
    public discordToken:string = "token";
    public roleName:string = "@everyone";
    public articleCfg:IArticleCfg = {} as any;
    */
    public blacklist:string[] // blacklist for config
    // private readonly saveTo:string = "./config/config.json";
    protected configName:string
    protected subCode:Long // subdir
    protected saveTo:string // save location
    public static get dirpath():string {
        let rootDir = path.resolve(process.cwd())
        if (!rootDir.endsWith("ncc_discord_auth")) {
            rootDir = path.resolve(".")
            if (rootDir.endsWith("build")) {
                rootDir = path.resolve("..")
            }
        }
        return path.resolve(rootDir,"config")
    }
    /**
     * Create constructor
     * @param _name Name of config
     * @param _version Version
     */
    public constructor(_name:string, _sub:Long = null, _version = Config.appVersion) {
        // this.dirpath = this.saveTo.substring(0,this.saveTo.lastIndexOf("/"));
        if (_sub == null) {
            _sub = new Long(0)
        }
        this.initialize(_name, _sub, _version)
        // console.log(`${_name}'s config: ${this.saveTo}`);
    }
    public initialize(_name:string, _sub:Long, _version = Config.appVersion) {
        this.version = _version
        this.blacklist = [...Config.excludes]
        if (_sub.neq(0)) {
            this.subCode = _sub
        }
        this.name = _name
    }
    public set sub(n:string) {
        this.subCode = Long.fromString(n)
        this.name = this.name
    }
    public set name(n:string) {
        this.configName = n
        if (this.subCode != null) {
            this.saveTo = path.resolve(Config.dirpath, n, `${this.subCode.toString(10)}.json`)
        } else {
            this.saveTo = path.resolve(Config.dirpath, `${n}.json`)
        }
    }
    public get name():string {
        return this.configName
    }
    /**
     * export config to file
     * @returns success? (reject,resolve)
     */
    public async export():Promise<void> {
        const write:string = JSON.stringify(this,
            (key:string,value:any) => (this.blacklist.indexOf(key) >= 0) ? undefined : value,"\t")
        try {
            await fs.ensureFile(this.saveTo)
            await fs.writeFile(this.saveTo,write,{encoding:"utf-8"})
            return Promise.resolve()
        } catch (err) {
            Log.e(err)
            return Promise.reject()
        }
    }
    public async has(_path = this.saveTo):Promise<boolean> {
        return fs.pathExists(this.saveTo)
        // return fs.ensureFile(this.saveTo).then(() => true).catch(() => false)
    }
    /**
     * import config from file
     * @returns success? (reject,resolve)
     */
    public async import(write:boolean = false):Promise<void> {
        const exists = await this.has()
        let file_version = Number.MAX_SAFE_INTEGER
        if (exists) {
            // load data
            const text:string = await fs.readFile(this.saveTo,{encoding:"utf-8"})
            let data
            try {
                data = JSON.parse(text)
            } catch (err) {
                Log.w("Config","JSON parse error at " + this.saveTo)
                data = {}
            }
            file_version = data.version
            // remove non-cloneable
            const ignore:string[] = [...this.blacklist]
            ignore.push("version")
            for (const [key, value] of Object.entries(ignore)) {
                if (ignore.indexOf(key) >= 0) {
                    delete data[key]
                }
            }
            // clone!
            this._clone(data)
            // update if app version is higher or write
            if (file_version < this.version || write) {
                return this.export()
            } else {
                return Promise.resolve()
            }
        }
        console.error("Can't read config file")
        if (write) {
            return await this.export()
        } else {
            return Promise.resolve()
        }
    }
    protected _clone(source:any) {
        for (const key of Object.keys(this)) {
            if (this.blacklist.indexOf(key) < 0 && this.hasOwnProperty(key)
                && source.hasOwnProperty(key)) {
                this[key] = this.clone_chain(source[key],this[key])
            }
        }
    }
    protected async checkDir():Promise<boolean> {
        return fs.access(Config.dirpath,fs.constants.R_OK | fs.constants.W_OK)
        .then(() => true)
        .catch((err) => fs.mkdir(Config.dirpath))
        .then(() => true)
        .catch((err) => Promise.resolve(false))
    }
    protected clone_chain<T>(source:any,dest:T):T {
        if (source == null || Array.isArray(dest) || !(dest instanceof Object) || dest == null) {
            // primitive type
            if (!Array.isArray(dest) && dest != null) {
                if (typeof dest === "number") {
                    if (source == null) {
                        source = 0
                    } else if (typeof source === "string") {
                        source = source.indexOf(".") >= 0 ?
                            Number.parseFloat(source) : Number.parseInt(source)
                    } else if (typeof source === "boolean") {
                        source = source ? 1 : 0
                    }
                } else if (typeof dest === "boolean") {
                    if (source === "1" || source === "true" || source === true) {
                        source = true
                    } else if (source === "0" || source === "false" || source === false) {
                        source = false
                    } else {
                        // :thinking:
                        source = false
                    }
                }
            }
            return source as T
        }
        const out:T = dest.constructor()
        for (const key of Object.keys(out)) {
            if (out.hasOwnProperty(key) && source.hasOwnProperty(key)) {
                out[key] = this.clone_chain(source[key],out[key])
            }
        }
        return out
    }
}