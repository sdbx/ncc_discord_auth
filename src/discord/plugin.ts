import * as Discord from "discord.js";
import Config from "../config";
import * as Log from "../log";
import Ncc from "../ncc/ncc";

export default abstract class Plugin {
    protected config:Config;
    protected client:Discord.Client;
    protected ncc:Ncc;

    /**
     * on plugin load
     * @param cl client
     * @param ncc nccapi
     */
    public init(cl:Discord.Client, nc:Ncc):void {
        this.client = cl;
        this.ncc = nc;
    }
    /**
     * on discord ready
     */
    public async ready():Promise<void> {
        Log.d(`${this.constructor.name} ready.`);
        return Promise.resolve();
    }
    /**
     * on message received(except command)
     * @param msg 
     */
    public async onMessage(msg:Discord.Message):Promise<void> {
        return Promise.resolve();
    }
    /**
     * reload config
     */
    public async reload():Promise<void> {
        return Promise.resolve();
    }
    public abstract async onCommand(msg:Discord.Message, command:string, options:WordPiece[]):Promise<void>;
    public async changeConfig(key:string, value:string):Promise<void> {
        if (this.config == null) {
            // ignore
            return Promise.reject(null);
        }
        let split = key.split(".");
        if (split.length >= 2) {
            if (split[0] === this.config.configName) {
                split = split.slice(1);
                return this.onConfigChange(this.config,split,value).then(() => this.config.export());
            }
            return Promise.reject(null);
        } else {
            return Promise.reject("잘못된 값입니다.");
        }
    }
    /**
     * Reflection config change & reloading
     * @param config Config val
     * @param keys chain of depth
     * @param value data as string?
     */
    protected async onConfigChange<T extends Config>(config:T,keys:string[], value:string):Promise<T> {
        let obj:any = config;
        let error:string = null;
        let i = 0;
        for (const key of keys) {
            if (i === 0 && config.blacklist.indexOf(keys[i]) >= 0) {
                error = `${keys[i]}는 수정할 수 없습니다.`;
                break;
            }
            const des = Reflect.getOwnPropertyDescriptor(obj,key);
            if (des !== undefined && des.enumerable && des.writable && des.configurable) {
                const _type = typeof obj[key];
                if (i === keys.length - 1) {
                    // apply value
                    if (_type === "number") {
                        let num:number;
                        if (value.indexOf(".") >= 0) {
                            num = Number.parseFloat(value);
                        } else {
                            num = Number.parseInt(value);
                            if (!Number.isSafeInteger(num)) {
                                num = NaN;
                            }
                        }
                        if (Number.isNaN(num) || !Number.isFinite(num)) {
                            error = `${value}는 숫자가 아니라서 ${keys.join(".")}에 할당을 못합니다.`;
                            break;
                        } else {
                            obj[key] = num;
                        }
                    } else if (_type === "boolean") {
                        const _value = value.trim();
                        if (_value === "true" || _value === "1" || _value === "ㅇ") {
                            obj[key] = true;
                        } else if (_value === "false" || _value === "0" || _value === "ㄴ") {
                            obj[key] = false;
                        } else {
                            error = `${value}는 논리값이 아니라 ${keys.join(".")}에 할당을 못합니다.`;
                            break;
                        }
                    } else if (_type === "string") {
                        obj[key] = value;
                    } else if (_type === "object") {
                        const innerObj = obj[key];
                        if (Array.isArray(innerObj)) {
                            if (innerObj.every((_v) => typeof _v === "number")) {
                                obj[key] = value.split(",").map((_v) => Number.parseInt(_v)).filter((_v) => Number.isSafeInteger(_v));
                            } else {
                                obj[key] = value.split(",");
                            }
                        } else {
                            error = `${keys.join(".")}에 하위 키 ${Reflect.ownKeys(innerObj).join(",")}가 있습니다.`;
                            break;
                        }
                    } else {
                        error = `${keys.join(".")}는 뭔지 모르겠습니다. (타입 ${_type})`;
                        break;
                    }
                } else {
                    if (_type === "object") {
                        obj = obj[key];
                    } else {
                        error = `${keys.slice(0,i + 1).join(",")}가 마지막입니다. (타입 ${_type})`;
                        break; 
                    }
                }
            }
            i += 1;
        }
        if (error != null) {
            return Promise.reject(error);
        }
        return Promise.resolve(config);
    }
}
export interface WordPiece {
    type:string,
    str:string,
}