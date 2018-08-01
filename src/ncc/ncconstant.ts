export const cafePrefix = "https://cafe.naver.com";
export const mCafePrefix = "https://m.cafe.naver.com";
export const whitelistDig = ["div", "p", "span", "h1", "h2", "h3", "h4", "h5", "h6", "br"];
export const CHAT_HOME_URL = "https://talk.cafe.naver.com"
export const CHAT_API_URL = `${CHAT_HOME_URL}/talkapi/v1`
export enum CHAT_APIS {
    CHANNEL = "channels",
}
export const COOKIE_SITES = ["https://nid.naver.com", "https://naver.com", CHAT_HOME_URL];
export const CHAT_BACKEND_URL = "https://talkwss.cafe.naver.com";
export const CHAT_SOCKET_IO = "https://talkwss.cafe.naver.com/socket.io/";
export interface NcIDBase {
    channelID:number;
}