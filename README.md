# AI Water Ledger

Estimate how much water your AI chats used.

Import your chat history exports from **Claude**, **ChatGPT** and **Gemini**. The page counts the tokens in every prompt and reply, then estimates the water data centers used to cool their hardware and to generate the electricity.

Everything runs in your browser. Export files are never uploaded, and totals are saved in your browser's local storage.

## Getting your exports

| Service | Where |
|---|---|
| Claude | claude.ai → Settings → Privacy → **Export data** |
| ChatGPT | chatgpt.com → Settings → Data controls → **Export data** |
| Gemini | [takeout.google.com](https://takeout.google.com) → My Activity → only **Gemini Apps**, format **JSON** |

Drop the downloaded `.zip` files (or the `conversations.json` / `MyActivity.json` inside them) onto the page.

## How water is estimated

```
water = tokens ÷ 1,000 × Wh per 1k tokens × (on-site WUE + PUE × power-plant water)
```

| Method | mL per 1,000 tokens | Basis |
|---|---|---|
| Provider-reported | ~0.4 | Google (Aug 2025, 0.26 mL per median Gemini prompt) and OpenAI (0.32 mL per query); cooling only |
| Cooling + power plants (default) | ~1.8 | Adds US-average water used to generate electricity (~3.1 L/kWh) |
| Li et al. 2023 | ~17 | "Making AI Less Thirsty", GPT-3-era hardware; an upper bound |

All four inputs can be adjusted on the page.

## Limits

- Tokens are estimated at about 4 characters per token.
- Hidden reasoning, file and image processing, and the conversation history re-read on each turn are not in the exports, so real usage is higher than counted.
- These are estimates. Providers do not publish per-user water figures.
