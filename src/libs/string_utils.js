/**
 * Created by Chamberlain on 26/08/2016.
 */
global.findMostCommonSubstr = function(longStr, params) {
    if(!params) params = {};
    var maxLength = params.maxLength || 10;
    var minLength = params.minLength || 2;
    var minCount = params.minCount || 2;
    var chars = params.chars || "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_-=!.@#$%^&*()?<>/0123456789";

    var ret = {most:'', mostCount: 0, long:'', longCount: 0, best:'', bestCount: 0, checks: 0, counts: {}};
    Object.defineProperty(ret, 'counts', {enumerable: false});
    
    var counts = ret.counts;
    var checked = {};
    var checks = 0;
    
    function findMatches(long, sub, id) {
        var len = sub.length+1;
        var chk = checked;
        while((id = long.indexOf(sub, id))>-1) {
            var subNext = long.substr(id, len);         //Find matches with this+(next character)
            id++;                                       //Advance the id (character-position)

            if(chk[subNext]) continue;
            chk[subNext] = true;
            checks++;

            var c = long.split(subNext).length;         //Count occurences of the substring.
            if(c>=minCount) {
                if(len>=minLength) counts[subNext] = c;
                if(len+1>=maxLength) continue;
                findMatches(long, subNext, id-1);
            }
        }
    }

    //Search each single alphanumeric / symbol chars:
    for(var s=0; s<chars.length; s++) {
        findMatches(longStr, chars[s], 0);
    }

    (function(ret, counts) {
        var maxCount = 0, maxCountProp='';
        var maxLength = 0, maxLengthCount=0, maxLengthProp='';
        var maxBest = 0, maxBestCount=0, maxBestProp='';

        for (var prop in counts) {
            var len = prop.length;
            
            if (len <= maxLength) continue; ////

            var c = counts[prop];
            var b = len * c;

            maxLength = len;
            maxLengthCount = c;
            maxLengthProp = prop;

            if (b > maxBest) { ////
                maxBest = b;
                maxBestCount = c;
                maxBestProp = prop;
            }

            if (c <= maxCount) continue; ////

            maxCount = c;
            maxCountProp = prop;
        }

        ret.most = maxCountProp;
        ret.mostCount = maxCount;
        ret.long = maxLengthProp;
        ret.longCount = maxLengthCount;
        ret.best = maxBestProp;
        ret.bestCount = maxBestCount;
        ret.checks = checks;
    })(ret, counts);

    return ret;
};