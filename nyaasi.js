export default new class ApiClient {
  async single({ titles, episode }, options) {
    if(options.apiUrl === "") {
      throw new Error("You must specify the base url of the third party nyaa.si api you are using in settings\n\nExample (not functional): https://nyaasi.yourwebsite.net")
    }

    if (!titles?.length) return []

    const query = this.buildSearchQuery(titles[0], episode)
    const headers = {
      "Content-Type": "application/json",
    }

    if(options.apiKey !== ""){
      headers["X-API-Key"] = options.apiKey
    }

    const res = await fetch(`${options.apiUrl}/api/search`, {
      method: "POST",
      headers,
      body: JSON.stringify({ term: query }),
    });

    if (!res.ok) {
      if(res.status === 429){
        if(options.apiKey !== "") {
          throw new Error("Invalid or incorrect API key!")
        }
        throw new Error("You cannot access this api without authorization! If you have an API key, make sure to put it in the extension settings!")
      }

      return []
    };
    
    const data = await res.json()

    if (!Array.isArray(data)) return []

    return this.map(data)
  }

  batch = this.single
  movie = this.single

  buildSearchQuery(title, episode) {
    let query = title.replace(/[^\w\s-]/g, ' ').trim()
    if (episode) query += ` ${episode.toString().padStart(2, '0')}`
    return query
  }

  map(data) {
    return data.map(item => ({
      title: item.name || '',
      link: item.magnet || '',
      seeders: parseInt(item.seeders || '0'),
      leechers: parseInt(item.leechers || '0'),
      downloads: parseInt(item.completed || '0'),
      accuracy: 'medium',
      hash: item.hash || '',
      size: item.filesize,
      date: new Date(item.date)
    }))
  }
  
  async test() {
    return true
  }
}()