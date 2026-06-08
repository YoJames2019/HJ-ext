export default new class ApiClient {
  async single({ titles, episode }, options) {
    if(options.apiUrl === "") {
      throw new Error("You must specify the base url of the third party nyaa.si api you are using in settings\n\nExample (not functional): https://nyaasi.yourwebsite.net")
    }

    if (!titles?.length) return []

    let results = await this.findTorrentResults(titles, episode, options)

    if (results.length < 1) results = await this.findTorrentResults(titles, episode, options, true)

    return results
  }

  batch = this.single
  movie = this.single

  async findTorrentResults(titles, episode, options, alt = false){
    let query = this.buildSearchQuery(titles[0], episode, options.useStrictSearchFirst, alt)

    let data = await this.fetchData(query, options, options.useStrictSearchFirst)

    if(options.useStrictSearchFirst && data.results.length < 1) {
      query = this.buildSearchQuery(titles[0], episode)
      data = await this.fetchData(query, options)
    }

    return this.map(data)
  }

  async fetchData(query, options, strict = false) {
    const headers = {
      "Content-Type": "application/json",
    }

    if(options.apiKey !== ""){
      headers["X-API-Key"] = options.apiKey
    }

    const res = await fetch(`${options.apiUrl}/api/search`, {
      method: "POST",
      headers,
      body: JSON.stringify({ term: query, pageSize: options.resultsLimit ?? 10 }),
    });

    if (!res.ok) {
      if(res.status === 429){
        if(options.apiKey !== "") {
          throw new Error("Invalid or incorrect API key!")
        }
        throw new Error("You cannot access this api without authorization! If you have an API key, make sure to put it in the extension settings!")
      }

      return { results: [], strict }
    };

    const data = await res.json()

    if (!Array.isArray(data)) return { results: [], strict }

    return { results: data, strict }
  }
  
  buildSearchQuery(title, episode, strict = false, alt = false) {
    let parsedTitle = title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\s-]/g, ' ').trim();
    let parsedEpisode = episode.toString().padStart(2, '0');
    
    // find season number
    let { strippedTitle, seasonText } = this.stripSeason(parsedTitle)
    
    let finalTitle = strippedTitle

    let query = `"${finalTitle}"`;
    if (episode) query += ` "${seasonText}${alt ? ` - ` : ``}${parsedEpisode} "`;

    if(strict) query = `"${query.replaceAll('"', "")}"`;

    return query;
  }

  stripSeason(input) {
      let match1 = input.match(regex1);
      let match2 = input.match(regex2);

      let seasonNumber = null;
      let strippedTitle = input;

      if (match1) {
          // If the first pattern matches, we take the number and remove that specific instance
          seasonNumber = match1[1];
          strippedTitle = input.replace(regex1, "").trim();
      } else if (match2) {
          // If the second fails but the second succeeds, we do the same for the second pattern
          seasonNumber = match2[1];
          strippedTitle = input.replace(regex2, "").trim();
      }

      return {
          seasonText: seasonNumber ? `S${seasonNumber}` : "",
          seasonNumber,
          strippedTitle
      };
  }

  map(data) {
    return data.results.map(item => ({
      title: item.name || '',
      link: item.magnet || '',
      seeders: parseInt(item.seeders || '0'),
      leechers: parseInt(item.leechers || '0'),
      downloads: parseInt(item.completed || '0'),
      accuracy: data.strict ? 'high' : 'medium',
      hash: item.hash || '',
      size: item.filesize,
      date: new Date(item.date),
      type: /((\[|\()(batch|bd)|batch|bdrip)/i.test(item.name) ? "batch" : null
    }))
  }
  
  async test() {
    return true
  }
}()