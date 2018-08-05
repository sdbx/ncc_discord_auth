import * as get from "get-value"
import { NcIDBase } from "../ncconstant"
import Cafe from "../structure/cafe"

export default class NcMessage implements NcIDBase {
    public static typeAsString(t:MessageType) {
        switch (t) {
            case MessageType.text: return "text"
            case MessageType.image: return "image"
            case MessageType.sticker: return "sticker"
            case MessageType.system: return "system"
            default: return "unknown"
        }
    }
    /**
     * Channel ID (only ID)
     * 
     * 보낸 방의 ID (오직 ID만)
     */
    public channelID:number
    /**
     * 안읽은 숫자
     */
    public readCount:number
    private readonly instance:INcMessage
    private _cafe:Cafe
    constructor(obj:object, cafe:Cafe, channelId:number) {
        this.instance = {...obj} as INcMessage
        this._cafe = cafe
        this.channelID = channelId
        this.readCount = 0
    }
    /**
     * Cafe Info
     * 
     * 네이버 카페 정보
     */
    public get cafe() {
        return this._cafe
    }
    /**
     * Message ID
     * 
     * 메세지 ID
     */
    public get messageId() {
        return this.instance.id
    }
    /**
     * Content (내용)
     * 
     * 내용.. TextOnly
     */
    public get content():string | NcImage | NcSticker {
        const extras = this.instance.extras
        switch (this.type) {
            case MessageType.image: {
                if (extras == null) {
                    return null
                }
                const parse = JSON.parse(extras)
                return this.parseImage(parse["image"])
            }
            case MessageType.sticker: {
                if (extras == null) {
                    return null
                }
                const parse = JSON.parse(extras)
                return {...parse["sticker"]} as NcSticker
            }
            case MessageType.text: {
                return this.instance.body
            }
            case MessageType.system: {
                return this.instance.body
            }
            default: {
                // system message
                return this.instance.body
            }
        }
        // fallback
        return ""
    }
    /**
     * Type (타입)
     * 
     * Image / Sticker / text (with RichEmbed)
     */
    public get type() {
        const t = this.instance.type
        if ([1,10,11].indexOf(t) >= 0) {
            return t as MessageType  
        } else {
            // 105: change room name
            if ([101,102,103,105,106,121].indexOf(t) >= 0) {
                return MessageType.system
            }
            return MessageType.unknown
        }
    }
    public get systemType():SystemType {
        const t = this.instance.type
        for (const value of Object.values(SystemType)) {
            if (t === value) {
                return value
            }
        }
        return SystemType.unknown
    }
    /**
     * Embed (세부 정보)
     * 
     * If no exists, return null;
     */
    public get embed() {
        if (this.type !== MessageType.text) {
            return null
        }
        const extras = this.instance.extras
        if (extras == null || extras.length <= 0) {
            // No embed.
            return null
        }
        // snipet (embed)
        const parse = JSON.parse(extras)
        const embed = {
            image: this.parseImage(get(parse, "snippet.image")),
            ...parse["snippet"],
        } as NcEmbed
        return embed
    }
    /**
     * sender (system: null)
     * 
     * 보낸 사람 (system: null)
     */
    public get sender():{naverId:string, nick:string} {
        if (this.type === MessageType.system) {
            if (this.instance.extras == null) {
                return null
            }
            try {
                const extra = JSON.parse(this.instance.extras)
                const _sender = JSON.parse(get(extra, "cafeChatEventJson"))
                const sender = get(_sender, "sender", { default: null })
                if (sender == null) {
                    return null
                }
                return {
                    naverId: get(sender, "id"),
                    nick: get(sender, "nickName"),
                }
            } catch {
                return null
            }
        } else {
            return {
                naverId: this.instance.writerId,
                nick: this.instance.writerName,
            }
        }
    }
    /**
     * timestamp (GMT, EpochTime)
     * 
     * 메세지 보낸 시기
     */
    public get timestamp() {
        return this.instance.createdTime
    }
    /**
     * timestamp (GMT, EpochTime) as Date
     * 
     * 메세지 보낸 시기
     */
    public get sentDate() {
        return new Date(this.timestamp)
    }
    private parseImage(json:object) {
        if (json["url"] == null) {
            // Not valid image
            return null
        }
        const safeParse = (value:number | null) => {
            if (value == null) {
                return -1
            } else {
                return value
            }
        }
        return {
            url: json["url"],
            width: safeParse(json["width"]),
            height: safeParse(json["height"]),
            is_original_size: json["is_original_size"],
        } as NcImage
    }
}
/**
 * Message's type
 * only three found..
 */
export enum MessageType {
    text = 1,
    image = 11,
    sticker = 10,
    system = -1,
    unknown = -2,
}
export enum SystemType {
    unknown = -1,
    kicked = 103,
    changed_Roomname = 105,
    kick = 106,
    changed_Master = 121,
}
export interface INcMessage {
    id:number;
    body:string;
    writerId:string;
    writerName:string;
    type:number; // 1: text 11:image 10:sticker
    createdTime:number;
    extras:string; // image:{width, url, height, is...} json
}

export interface NcImage {
    url:string; // nullable
    width:number; // nullable
    height:number; // nullable
    is_original_size?:boolean; // nullable
}
export interface NcSticker {
    stickerId:string; // stickerId
    seq:number; // ??
    packName:string; // packname... where use?
    width:number; // useless
    height:number; // useless
    imageUrl:string; // umm
}
export interface NcEmbed {
    title:string; // kkiro.kr - Title of embed
    url:string; // https://kkiro.kr/
    description:string; // Kkiro's personal blog
    domain:string; // kkiro.kr - ?
    type:string; // video | null - notfound.
    image:NcImage;
}
/*

extras - rich
"extras":"{\"snippet\":{\"title\":\"kkiro.kr\",\"url\":\"https://kkiro.kr/\",
\"description\":\"Kkiro's personal blog\",\"domain\":\"kkiro.kr\",
\"type\":null,\"image\":{\"url\":null,\"height\":null,\"width\":null}}}"
"extras":"{\"snippet\":{\"title\":\"League of Legends Soundtrack - 01 - Ranked Match Song\"
,\"url\":\"https://www.youtube.com/watch?v=1PHJtkgAwE8\",\"description\":\"
Click the link below to get more Info, and play League of Legends. http://s
ignup.leagueoflegends.com/?ref=4d4b1e2e2a44f130428378 Thanks for the Views.\",
\"domain\":\"www.youtube.com\",\"type\":\"video\",
\"image\":{\"url\":\"https://i.ytimg.com/vi/1PHJtkgAwE8/maxresdefault.jpg\",\"height\":1080,\"width\":1440}}}"

extras - sticker
"extras":"{\"sticker\":{\"stickerId\":\"linebiz21_01-1-185-160\",\"seq\":1,
\"packName\":\"linebiz21_01\",\"width\":185,\"height\":160,
\"imageUrl\":\"https://gfmarket-phinf.pstatic.net/linebiz21_01/original_1.png\"}}"

extras - image
"extras":"{\"image\":{\"width\":617,
\"url\":\"https://ssl.pstatic.net/cafechat.phinf/MjAxODA3MzFfOTMg/MDAxNTMzMDQ2NzY5MTY2.dwSX-YOXwGXc8l7-mccp
IBB0Leq7Jhh1-nvyWYmTc8Ag.WnDE31tCOfhm0l9x8zi4zLqPapdodDbKOcg1lbCdAqog.PNG.alyacraft/
Screen_Shot_2018-07-31_at_11.13.16_PM.png\",
\"height\":158,\"is_original_size\":false}}"
*/