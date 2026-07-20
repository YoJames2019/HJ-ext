function buildSearchQuery(title, episode, strict = false) {
    let parsedTitle = title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\s\p{P}\p{S}]/gu, ' ').trim();
    let parsedEpisode = episode.toString().padStart(2, '0');

    let res = this.stripSeason(parsedTitle)
    
    let seasonNumber = res.seasonNumber
    let finalTitle = res.strippedTitle

    let query;

    if (strict) {
        query = `"${finalTitle} ${seasonNumber ? `Season ${seasonNumber} ` : ""}- ${parsedEpisode}"`;
    }
    else {
        let combos = genSeasonTitleEpisodeCombinations(parsedTitle, seasonNumber, parsedEpisode)

        query = combos.map(r => `"${r}"`).join("|")
    }

    return query;
}


function genSeasonTitleEpisodeCombinations(titles, seasonNumber, episode) {

    if(!Array.isArray(titles)) titles = [titles]

    let seasonVariations = ["{num}{suffix} Season {sep}", "S{num}{sep}", "Season {num} {sep}"]
    let episodeSeparators = ["E", " - "]


    let finalCombos = []
    let seasonCombos = []

    if (!seasonNumber) seasonNumber = 1

    for (let title of titles) {
        if (title.includes(":")) titles.push(title.split(":")[0])

        for (let variationTemplate of seasonVariations) {
            let variationStr = variationTemplate.replace("{num}", seasonNumber).replace("{suffix}", getSuffix(seasonNumber))
            let str = `${title} ${variationStr}`
            seasonCombos.push(str)
        }

        if (seasonNumber === 1) {
            seasonCombos.push(`${title} {sep}`)
        }
    }

    for (let separator of episodeSeparators) {
        for (let comboIndex in seasonCombos) {
            finalCombos.push(`${seasonCombos[comboIndex].replace("{sep}", separator)}${String(episode).padStart(2, "0")} `.replace(/[ ]{2,}/g, " "))
        }
    }


    return finalCombos
}

function getSuffix(input) {
    switch (input) {
        case 1:
            return "st"
        case 2:
            return "nd"
        case 3:
            return "rd"
        default:
            if (input > 0) {
                return "th"
            }
            return ""
    }
}

function stripSeason(input) {
    let seasonRegexes = [/Season\s+(\d+)/i, /(\d+)(?:st|nd|rd|th)\s*Season/i]

    let seasonNumber = null;
    let strippedTitle = input;

    for (let regex of seasonRegexes) {
        let match = input.match(regex)

        if (match) {
            seasonNumber = match[1]
            strippedTitle = input.replace(regex, "").trim()
            break
        }
    }

    return {
        seasonText: seasonNumber ? `S${seasonNumber}` : "",
        seasonNumber,
        strippedTitle
    };
}

let res = genSeasonTitleEpisodeCombinations(["Tsue to Tsurugi no Wistoria"], 2, 3)


res.sort().forEach(t => console.log(t))

console.log(buildSearchQuery("Tsue to Tsurugi no Wistoria", 2 ))