import { ParamStr } from "./nccutil"
const s = ParamStr.make

export const cafePrefix = "https://cafe.naver.com"
export const mCafePrefix = "https://m.cafe.naver.com"
export const whitelistDig = ["div", "p", "span", "h1", "h2", "h3", "h4", "h5", "h6", "br"]
export const CHAT_HOME_URL = "https://talk.cafe.naver.com"
export const CHAT_API_URL = `${CHAT_HOME_URL}/talkapi/v1`
export const CAFE_DEFAULT_IMAGE = `https://ssl.pstatic.net/static/cafe/chatting/default_cafe.png`
export enum CHAT_APIS {
    CHA2NNEL = "channels",
    CA2FE = "categories",
}
export const COOKIE_SITES = ["https://nid.naver.com", "https://naver.com", CHAT_HOME_URL, cafePrefix]
export const NID_CAPTCHA = `https://nid.naver.com/login/image/captcha`
export const INSECURE_CAPTCHA = `http://captcha.naver.com`

export const CHAT_BACKEND_URL = "https://talkwss.cafe.naver.com"
export const CHAT_SOCKET_IO = `${CHAT_BACKEND_URL}/socket.io/`
export const CHAT_CHANNEL_URL = s(`${CHAT_HOME_URL}/channels/$`)
export const CHAT_IMAGE_UPLOADED_HOST = `https://ssl.pstatic.net/cafechat.phinf`
export const CHAT_IMAGE_UPLOAD_URL = `https://up.cafe.naver.com/AttachChatPhotoForJindoUploader.nhn`

export const CHATAPI_CHANNEL_SYNC = s(`${CHAT_API_URL}/channels/$/sync`)
export const CHATAPI_CHANNEL_LEAVE = s(`${CHAT_API_URL}/channels/$/quit`)
export const CHATAPI_CHANNELS = `${CHAT_API_URL}/channels?onlyVisible=true`
export const CHATAPI_CAFES = s(`${CHAT_API_URL}/categories?channelTypeCode=$`)
export const CHATAPI_CHANNEL_CREATE = s(`${CHAT_API_URL}/categories/$/channels`)
export const CHATAPI_CHANNEL_OPENCREATE = s(`${CHAT_API_URL}/categories/$/openchannels`)
export const CHATAPI_CHANNEL_CREATE_PERM = s(`${CHAT_API_URL}/categories/$/createChannelPrivileges?channelTypeCode=$`)
export const CHATAPI_CAPTCHA = `${CHAT_API_URL}/captcha`
export const CHATAPI_PHOTO_SESSION_KEY = `${CHAT_API_URL}/talkapi/v1/photo/sessionKey`

export interface NcIDBase {
    channelID:number;
}