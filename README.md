# Verkefni 6: Galdrar með handapati

- **Höfundur:** Aron Frosti Davíðsson
- **Áfangi:** VEFÞJ2VF05AU - Viðmótsforritun
- **Skóli:** Tækniskólinn

---

## Verkefnalýsing

Þetta verkefni er frumgerð af gagnvirku 2D teikniforriti sem notar handapatsstjórnun (e. hand gesture control) í gegnum vefmyndavél. Notandinn getur teiknað á skjáinn með því að nota vísifingur og forritið greinir sjálfkrafa hvort að notandi teiknaði hring eða þríhyrning. Þegar form er greint er notandinn látinn vita með örlítilli sprenginungu sem að gerist á skjánum.

Markmiðið með verkefninu var að nota það sem að ég lærði í áfanganum til þess að búa til einskins "galda kerfi" sem að snýst út á að teikna galdurinn sem að þú villt nota. Ég ákvað að útfæra það með handapati til þess að einfalda hvernig maður "teiknar galdrana"

---

## Vefslóð á verkefnið

Hægt er að prófa vefkefnið hér:

[https://aronfd07.github.io/Verkefni_6_Vidmodsforritun/](https://aronfd07.github.io/Verkefni_6_Vidmodsforritun/)

---

## Leiðbeiningar um Notkun

1.  **Opnaðu vefsíðuna** og leyfðu notkun á vefmyndavél.
2.  **Notaðu vísifingurinn og löngutöng** til að teikna á skjáinn.
3.  Best er að **teygja út þumalputann** til þess að gera hlé á teikningu. Þetta er gagnlegt til að byrja á nýju formi án þess að tengja það við það fyrra.
4.  **Settu þumalputtann aftur niður** til að halda áfram að teikna.
5.  Reyndu að teikna **hring** eða **þríhyrning**. Þegar forritið greinir formið gerist einskonar sprenging út frá forminu, blá sprenging fyrir hring og rauð sprenging fyrir þríhyrning.

---

## Myndir og Myndband

**Skjáskot af vefsíðu:**

![Skjáskot 1](https://raw.githubusercontent.com/aronfd07/Verkefni6_Vidmodsforritun/main/image_2025-10-12_233334752.png)
![Skjáskot 2](https://raw.githubusercontent.com/aronfd07/Verkefni6_Vidmodsforritun/main/image_2025-10-12_233411294.png)

## Myndir og Myndband

**Myndband af notkun (Youtube):**

[![Myndband af verkefninu](https://img.youtube.com/vi/RqOJxQKZ9W8/0.jpg)](https://youtu.be/RqOJxQKZ9W8)

[Skoða á YouTube](https://youtu.be/RqOJxQKZ9W8)

---

## Heimildir og Söfn

- **Google MediaPipe Hands:** Notað til að greina staðsetningu handa og fingra í rauntíma úr myndstraumi vefmyndavélar.  
  - [MediaPipe á vefnum](https://developers.google.com/mediapipe)
  - [MediaPipe Camera Utils](https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js)
  - [MediaPipe Control Utils](https://cdn.jsdelivr.net/npm/@mediapipe/control_utils/control_utils.js)
  - [MediaPipe Drawing Utils](https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js)
  - [MediaPipe Hands](https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js)


---

## Útkoman og Næstu Skref

### Hvernig tókst til?
Verkefnið hepnaðist ágætlega. Ég byggði ofaná kóðann minn í verkefni 5 til þess að þurfa ekki að búa til nýja handapats stjórnun. Ég eyddi í fyrstu of miklum tíma í að gera allt verkefnið í AR líka en þá var ég farinn að of langt með verkefnið til þess að geta klárað það á tveimur vikum.

### Næstu Skref
Ef haldið yrði áfram með þróun þessarar frumgerðar væru næstu skref:

1.  **Bæta við fleiri formum:** Útfæra greiningu fyrir ferninga, stjörnur o.fl.
2.  **Auka nákvæmni:** Fínstilla reikniritin enn frekar, mögulega með því að nota einföld myndalíkön (e. image recognition models).
4.  **Fleiri og flóknari galdrar:** Frekar en að nota bara einföld form væri hægt að gera munstur af formum til þess að setja í gang flóknari galdra sem að væri mikið erfiðara að forrita.
