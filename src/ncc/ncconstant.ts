import { ParamStr } from "./nccutil"
const s = ParamStr.make

export const cafePrefix = "https://cafe.naver.com"
export const mCafePrefix = "https://m.cafe.naver.com"
export const whitelistDig = ["div", "p", "span", "h1", "h2", "h3", "h4", "h5", "h6", "br"]
export const CHAT_HOME_URL = "https://talk.cafe.naver.com"
export const CHAT_API_URL = `${CHAT_HOME_URL}/talkapi/v1`
export enum CHAT_APIS {
    CHANNEL = "channels",
    CAFE = "categories",
}
export const COOKIE_SITES = ["https://nid.naver.com", "https://naver.com", CHAT_HOME_URL]
export const CHAT_BACKEND_URL = "https://talkwss.cafe.naver.com"
export const CHAT_SOCKET_IO = `${CHAT_BACKEND_URL}/socket.io/`
export const CHAT_CHANNEL_URL = s(`${CHAT_HOME_URL}/channels/$`)

export const CHATAPI_CHANNEL_SYNC = s(`${CHAT_API_URL}/channels/$/sync`)
export const CHATAPI_CHANNELS = `${CHAT_API_URL}/${CHAT_APIS.CHANNEL}?onlyVisible=true`
export const CHATAPI_CAFES = s(`${CHAT_API_URL}/${CHAT_APIS.CAFE}?channelTypeCode=$`)
export const CHATAPI_CAFE_INVITE = s(`${CHAT_API_URL}/${CHAT_APIS.CAFE}/$/channels`)

export interface NcIDBase {
    channelID:number;
}