import { ParamStr } from "./nccutil"
const s = ParamStr.make

export const naverRegex = new RegExp(/^(http|https):\/\/[A-Za-z0-9\.]*naver\.com\//, "gm")
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
export const COOKIE_SITES = ["https://nid.naver.com", "https://naver.com",
    CHAT_HOME_URL, cafePrefix, "https://www.naver.com"]
export const NID_CAPTCHA = `https://nid.naver.com/login/image/captcha`
export const INSECURE_CAPTCHA = `http://captcha.naver.com`
export const CAFE_LOGIN_CHECK = `${cafePrefix}/LoginCheck.nhn?m=check`
export const CAFE_PROFILE_UPDATE = `${cafePrefix}/CafeMemberInfoUpdate.nhn`
export const CAFE_NICKNAME_CHECK = `${cafePrefix}/CafeMemberNicknameCheckAjax.nhn`
export const CAFE_UPLOAD_FILE = `https://up.cafe.naver.com/AttachFile.nhn`

export const CHAT_BACKEND_URL = "https://talkwss.cafe.naver.com"
export const CHAT_SOCKET_IO = `${CHAT_BACKEND_URL}/socket.io/`
export const CHAT_CHANNEL_URL = s(`${CHAT_HOME_URL}/channels/$`)
export const CHAT_IMAGE_UPLOADED_HOST = `https://ssl.pstatic.net/cafechat.phinf`
export const CHAT_IMAGE_UPLOAD_URL = s(`https://cafe.upphoto.naver.com/$/simpleUpload/0`)

/* per-channel command */
export const CHATAPI_CHANNEL_BAN = s(`${CHAT_API_URL}/channels/$/ban?banUserId=$`)
export const CHATAPI_CHANNEL_SYNC = s(`${CHAT_API_URL}/channels/$/sync`)
export const CHATAPI_CHANNEL_LEAVE = s(`${CHAT_API_URL}/channels/$/quit`)
export const CHATAPI_CHANNEL_PERIOD = s(`${CHAT_API_URL}/channels/$/period`)
export const CHATAPI_CHANNEL_CLEARMSG = s(`${CHAT_API_URL}/channels/$/messages`)
export const CHATAPI_CHANNEL_INFO = s(`${CHAT_API_URL}/channels/$`)
export const CHATAPI_CHANNEL_CHGOWNER = s(`${CHAT_API_URL}/categories/$/channels/$/owner/$`)
export const CHATAPI_CHANNEL_INVITE = s(`${CHAT_API_URL}/categories/$/channels/$/invite`)
export const CHATAPI_CHANNEL_JOIN = s(`${CHAT_API_URL}/channels/$/join`)

/* global commands */
export const CHATAPI_CAFES = s(`${CHAT_API_URL}/categories?channelTypeCode=$`)
export const CHATAPI_CHANNELS = `${CHAT_API_URL}/channels?onlyVisible=true`
export const CHATAPI_CHANNEL_CREATE = s(`${CHAT_API_URL}/categories/$/channels`)
export const CHATAPI_CHANNEL_OPENCREATE = s(`${CHAT_API_URL}/categories/$/openchannels`)
export const CHATAPI_CHANNEL_CREATE_PERM = s(`${CHAT_API_URL}/categories/$/createChannelPrivileges?channelTypeCode=$`)
export const CHATAPI_CAPTCHA = `${CHAT_API_URL}/captcha`
export const CHATAPI_PHOTO_SESSION_KEY = `${CHAT_API_URL}/photo/sessionKey`
export const CHATAPI_USER_BLOCK = `${CHAT_API_URL}/blockMembers`
export const CHATAPI_BLOCKLIST_CAFE = `${CHAT_API_URL}/blockCafes`
export const CHATAPI_CAFE_BLOCK = s(`${CHAT_API_URL}/categories/$/block`)
export const CHATAPI_OPENCHAT_LIST = s(`${CHAT_API_URL}/categories/$/openchannels`)
export const CHATAPI_MEMBER_SEARCH = s(`${CHAT_API_URL}/categories/$/members`)
export const CHAT_URL_CRAWLER = `${CHAT_HOME_URL}/crawler`

/* ncc config */
// ms
export const intervalNormal = 120000
export const intervalError = 10000

export interface NcIDBase {
    channelID:number;
}