import Cafe from "./cafe"

export default interface Profile extends Cafe {
    profileurl:string;
    nickname:string;
    userid:string;
    level?:string;
    numVisits?:number;
    numArticles?:number;
    numComments?:number;
}