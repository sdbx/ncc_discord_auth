import Profile from "./profile";

export default interface Comment extends Profile {
    content:string;
    timestamp:number;
    imageurl?:string;
    stickerurl?:string;
}
export function getTimeDiffer(cmt:Comment) {
    return new Date().getTime() - cmt.timestamp;
}