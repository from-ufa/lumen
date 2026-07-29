# Session report: idle keys stop snapping every 5s

**HEAD:** `fecd9cd`  
**Причина:** при poll rebuild не сохраняли `angle` у idle → возврат на стартовые позиции.  
**Фикс:** preserve angle/x/y для idle так же, как для active.  
**Deploy:** build + restart · `/oracles` 200  
