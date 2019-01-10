import { Dwh, Dxy } from "./dsglobal"
import DsTerrain from "./dsterrain"

export default interface DsState {
    moonSeq:number,
    moonName:string,
    moonBaptismal:string,
    planetName:string,
    planetPosition:Dxy,
    planetSize:Dwh,
    terrians:DsTerrain[],
}