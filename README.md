# FXConvert

## Özellikler

- Önbellek ve eski kur yedeğiyle canlı resmi para dönüşümü
- CoinGecko erişilebilir olduğunda BTC, ETH, SOL ve XRP desteği
- Orta piyasa ve ücret sonrası toplamları gösteren banka/kart ücreti hesaplayıcı
- Sıralama ve filtreleme destekli çoklu para birimi karşılaştırma tablosu
- Favori pariteler, dönüşüm geçmişi ve paylaşılabilir URL'ler
- Tarayıcı bildirimi veya uygulama içi kur uyarıları
- Sayfa yüklenirken yanlış tema parlaması olmadan koyu mod
- PWA manifesti ve service worker önbelleği
- Klavye kısayolları: Enter, S, D, F, Escape

## ExchangeRate-API Anahtarı

Uygulama, birincil resmi para kuru sağlayıcısı olarak ExchangeRate-API kullanacak şekilde `script.js` içinde şu anahtarla yapılandırılmıştır:

```js
API_KEY: 'f8901a525376ae8de1a967ab'
```

Birincil sağlayıcı başarısız olursa uygulama mümkün olduğunda Frankfurter yedeğine döner.

## Proje Dosyaları

- `index.html` uygulama kabuğunu ve erişilebilir arayüz kontrollerini içerir.
- `style.css` duyarlı açık/koyu tema stillerini içerir.
- `script.js` API, dönüşüm, kalıcılık, uyarılar ve PWA mantığını içerir.
- `sw.js` statik varlıklar için cache-first, API istekleri için network-first önbellekleme uygular.
- `manifest.json` ve `icon.svg` PWA meta verilerini sağlar.

## Bilinen MVP Sınırları

- Uygulamanın statik ve kendi kendine yeterli kalması için PNG ikonlar yerine SVG ikon kullanılır.
