import { Client, Webhook } from "discord.js"
import { Ncc } from "ncc.js"
import Cache from "../cache"
import Config from "../config"
import Lang from "./lang"
import { MainCfg } from "./runtime"

/**
 * Variable sharing between modules
 */
export interface IRuntime {
    /**
     * Discord client
     */
    client:Client;
    /**
     * Naver Cafe Chat + Naver Cafe API client
     */
    ncc:Ncc;
    /**
     * language file
     * 언어팩 - 기본: 프레타체
     */
    lang:Lang;
    /**
     * Global config like token, prefix..
     * 
     * 최상위 설정 파일
     */
    global:MainCfg;
    /**
     * The list of config with plugins
     */
    subConfigs:Map<string, Config>;
    /**
     * Webhook list using this bot.
     */
    webhooks:Map<string, Cache<{
        value:Webhook,
        img:string,
    }>>;
}