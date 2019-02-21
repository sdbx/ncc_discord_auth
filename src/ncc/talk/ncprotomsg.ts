/**
 * Main Interface
 */
export interface INcMessage {
    /**
     * Message's ID
     */
    messageId:number;
    /**
     * Content (string only), **blank** when other message
     */
    content:string;
    /**
     * Content's Extra Info, Image or Sticker or etc...
     */
    extras:string;
    /**
     * Message's Sender ID
     */
    authorId:string;
    /**
     * Message's Sender Nickname
     */
    authorName:string;
    /**
     * Message's Type
     */
    messageType:number;
    /**
     * Message's Created Timestamp.
     */
    createdTime:number;
    /**
     * Dummy for now.
     */
    updatedTime:number;
    /**
     * Message's Channel ID
     */
    channelId:number;
    /**
     * Message's ReadCount
     */
    readCount:number;
    /**
     * Members count when message was sent.
     */
    memberCount:number;
    /**
     * Message is hidden? (from staff, owner, etc...)
     * 
     * Default: false
     */
    hidden:boolean;
}
/**
 * Interface when Synced last Message
 */
export interface ILastMessage {
    id:number;
    body:string;
    writerId:string;
    writerName:string;
    type:number; // 1: text 11:image 10:sticker
    createdTime:number;
    extras:string; // image:{width, url, height, is...} json
}
/**
 * Interface when **Now** Message Received
 */
export interface INowMessage {
    serialNumber:string;
    typeCode:number;
    userId:string;
    contents:string;
    memberCount:number;
    createTime:string;
    updateTime:string;
    extras:string;
    tempId:string;
    readCount:number;
}
/**
 * Interface when **Past** Message Received
 */
export interface IPastMessage {
    channelNo:number;
    userId:string;
    messageNo:number;
    content:string;
    memberCount:number;
    messageTypeCode:number;
    messageStatusType:"NORMAL" | "HIDDEN";
    extras:string;
    tid:number;
    emotion?:any; // ?
    createTime:number;
    updateTime:number;
    readCount:number;
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
    joined = 101,
    quited = 102,
    kicked = 103,
    changed_Roomname = 105,
    kick = 106,
    changed_Master = 121,
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
    /**
     * Title of embed
     */
    title:string; // kkiro.kr - Title of embed
    /**
     * Description of embed
     */
    description:string; // Kkiro's personal blog
    /**
     * Display URL
     */
    domain:string; // kkiro.kr - ?
    /**
     * Link's URL (not shown)
     */
    url:string; // https://kkiro.kr/
    /**
     * "video" or null
     */
    type:string; // video | null - notfound.
    /**
     * Embed Image
     */
    image:NcImage;
}
/*
 * {
            url: "https://kkiro.kr/",
            playtimeText: "PlayTime_Text",
            thumbnailSecure: "https://cdn.discordapp.com/attachments/152746825806381056/501937755518140417/unknown.png",
            title: "Title",
            description: "Desc",
        }
 */
export interface NcTvCast {
    /**
     * Embed title
     */
    title?:string;
    /**
     * Embed description
     */
    description?:string;
    /**
     * Tvcast link
     */
    url:string;
    /**
     * Tvcast preview image url
     */
    thumbnailSecure?:string;
    /**
     * Text bottom of play icon.
     */
    playtimeText?:string;
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