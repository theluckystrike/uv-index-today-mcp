# Data sources

All sources below were fetched on 2026-11-05 while building version 1.0.0. The UV Index values are read at call time; only the EPA scale bands and the alert rule are written into the code.

| Data | URL | Notes |
|---|---|---|
| Daily UV Index and UV Alert by ZIP or city | https://data.epa.gov/dmapservice/getEnvirofactsUVDAILY/ZIP/{zip}/JSON and .../CITY/{city}/STATE/{st}/JSON | Keyless. Fields ZIP_CODE, CITY, STATE, UV_INDEX, UV_ALERT, DATE. Cache 30 minutes. |
| Hourly UV Index by ZIP or city | https://data.epa.gov/dmapservice/getEnvirofactsUVHOURLY/ZIP/{zip}/JSON and .../CITY/{city}/STATE/{st}/JSON | DATE_TIME is local time of the place (EPA service docs). Cache 30 minutes. |
| Service documentation | https://www.epa.gov/enviro/web-services#uvindex | Lists the four endpoints and output columns. |
| Category bands and advice | https://www.epa.gov/sunsafety/uv-index-scale-0 | 1-2 Low, no protection needed. 3-7 Moderate to High, protection needed. 8+ Very High to Extreme, extra protection needed. Page last updated June 15, 2026. |
| Same bands, WHO | https://www.who.int/news-room/questions-and-answers/item/radiation-the-ultraviolet-(uv)-index | 0 to 2, 3 to 7, 8 and above. |
| UV Alert rule | https://www.cpc.ncep.noaa.gov/products/stratosphere/uv_index/uv_alert.shtml | UV Index must be 6 or above and more than the local climatological mean plus one standard deviation. |

Test fixtures in `test/fixtures/` are raw EPA payloads saved on 2026-11-05 for ZIP 33101 (Miami), ZIP 20050 (Washington) and Phoenix, AZ, plus the EPA error for ZIP 00000.
