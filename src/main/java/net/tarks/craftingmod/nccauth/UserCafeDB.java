package net.tarks.craftingmod.nccauth;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import net.tarks.craftingmod.nccauth.discord.DiscordUser;

import java.io.File;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Set;

public class UserCafeDB {
    public HashMap<Long,String> list;
    private static final Gson g = new GsonBuilder().create();
    public UserCafeDB(){
        list = new HashMap<>();
    }
    public void init(){
        if(list == null){
            list = new HashMap<>();
        }
    }
    public boolean hadAuth(DiscordUser u){
        return list.containsKey(u.userID);
    }
    public boolean duplicateAuth(DiscordUser u){
        return list.containsValue(u.cafeID.toLowerCase());
    }
    public void putUser(DiscordUser u){
        list.put(u.userID,u.cafeID.toLowerCase());
    }
    public void removeUser(DiscordUser u){
        if(list.containsKey(u.userID)){
            list.remove(u.userID);
        }
    }
    public long getDiscordIDFromCafeID(DiscordUser u){
        ArrayList<Long> l = new ArrayList<>();
        l.addAll(Util.getKeysByValue(list,u.cafeID));
        if(l.size() == 0){
            return -1;
        }else{
            return l.get(0);
        }
    }
    public void save(){
        Util.write(new File(Util.getRootdir(),"users.json"),g.toJson(this));
    }
}
