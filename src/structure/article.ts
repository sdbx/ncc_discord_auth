import Cafe from "./cafe";
import Comment from "./comment";

export default interface Article extends Cafe {
    articleId:number; // int, article id
    articleTitle:string; // article title
    flags:{
        file:boolean,
        image:boolean,
        video:boolean,
        question:boolean,
        vote:boolean,
    }; // article flags
    userName:string; // user name
    userId:string; // real user identifier
    url:string; // article url
    comments?:Comment[]; // comments
    imageURL?:string; // preview image url
    contents?:Array<{type:"embed" | "image" | "text" | "newline",data:string}>; // content (max.3?)
}
