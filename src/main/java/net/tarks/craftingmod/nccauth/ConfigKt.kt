package net.tarks.craftingmod.nccauth

data class ConfigKt(val discordToken:String,val cafeURL:String){
    var version:Int = Config.config_version

    var cafeID: Long = 0
    var articleID: Long = -1
    var cafeCommentURL: String = cafeURL
    var discordRoomID: Long = -1 // room id for management
    var discordBotChID: Long = -1
    var discordMainChID: Long = -1
    var discordToRolesName: String = "@everyone"
    var trustedUsers:ArrayList<Long> = ArrayList()
    var discordWelcomeMsg: String = ""
    var discordAuthedMsg: String = ""
    var discordGame: String = ""
    var discordGameType: Long = 0
}