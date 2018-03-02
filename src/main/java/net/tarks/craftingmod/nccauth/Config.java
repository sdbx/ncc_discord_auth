package net.tarks.craftingmod.nccauth;

import java.lang.reflect.Field;
import java.util.ArrayList;

public class Config {
    public static final int config_version = 2;
    public int version;
    public long cafeID;
    public long articleID;
    public String cafeCommentURL;
    public String discordToken;
    public long discordRoomID; // room id for management
    public long discordBotChID;
    public long discordMainChID;
    public String discordToRolesName;
    public ArrayList<Long> trustedUsers;
    public String discordWelcomeMsg;
    public String discordAuthedMsg;
    public String discordGame;
    public long discordGameType;

    public boolean enableArticleAlert;
    public long articleUpdateSec;
    public ArrayList<Long> discordArticleIDs;

    public Config(String discord_token, String cafeURL){
        version = config_version;

        cafeID = -1;
        articleID = -1;
        discordToken = discord_token;
        discordRoomID = -1;
        discordToRolesName = "Roles name";
        cafeCommentURL = cafeURL;
        discordBotChID = -1;
        discordMainChID = -1;
        trustedUsers = new ArrayList<>();
        discordWelcomeMsg = "";
        discordAuthedMsg = "";
        discordGame = "";
        discordGameType = 0;

        enableArticleAlert = false;
        articleUpdateSec = 120;
        discordArticleIDs = new ArrayList<>();
    }
    public void copyFrom(Config cfg){
        Field[] fields = this.getClass().getFields();
        for(Field f : fields){
            Object value;
            try {
                value = f.get(cfg);
                if(value != null){
                    f.set(this,value);
                }
            } catch (IllegalAccessException e) {
                e.printStackTrace();
            }
        }
    }
    public void setID(long cfID,long arID){
        cafeID = cfID;
        articleID = arID;
    }
}
