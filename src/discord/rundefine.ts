import Discord from "discord.js"
/**
 * Semi-transparent char
 * 
 * Works in nickname, but showing char in sublime
 */
export const blankChar = "\u{17B5}"
/**
 * Fully-transparent char
 * 
 * Does not work in nickname.
 */
export const blankChar2 = "\u{FFF5}"
/**
 * Thin space char
 * 
 * \> `0px` && < `1/5em`
 */
export const thinSpace = "\u{200A}"
/**
 * The suffix type using command receive.
 */
export enum ParamType {
    /**
     * 주어 (이/가)
     */
    thing = "이/가",
    /**
     * 대상 (을/를/좀)
     */
    dest = "을/를/좀",
    /**
     * 대상-목적 (에게/한테)
     */
    for = "에게/한테",
    /**
     * 목표 (으로/로)
     */
    to = "으로/로",
    /**
     * 위치 (에서)
     */
    from = "에서",
    /**
     * 커맨드 suffix (해줘/해/줘)
     */
    do = "해줘/해/줘",
    /**
     * 숫자? (만큼)
     */
    much = "만큼",
    /**
     * 기간? (동안)
     */
    period = "동안",
}
/**
 * Dummy, When to use?
 */
export enum ParamAccept {
    ANY,
    NUMBER,
    USER,
    CHANNEL,
}
/**
 * Chaining Data
 * 
 * Contains Type, Data, Timestamp.
 */
export interface ChainData {
    /**
     * Chain Type - Use Enum.
     */
    type:number;
    /**
     * Chain Data - need type convert
     */
    data:unknown;
    /**
     * Chained Time - commonly useless
     */
    time:number;
}
/**
 * State of ChatType
 */
export interface CmdParam {
    /**
     * Admin: internal admin, not ADMINISTRATOR permission.
     */
    isAdmin:boolean,
    /**
     * This means Guild is available
     * 
     * Group DM is DM.
     */
    isDM:boolean,
    /**
     * User inputed by Simple Type?
     */
    isSimple:boolean,
}
export enum UniqueID {
    /**
     * Unique by Channel
     */
    channel,
    /**
     * Unique by Guild (channel in DM)
     */
    guild,
    /**
     * Unique by User
     */
    user,
}
/**
 * Message Cloner.
 */
export interface ClonedMessage {
    attaches:Discord.Attachment[];
    embeds:Discord.RichEmbed[];
    content:string;
}