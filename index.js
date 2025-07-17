const express = require("express");
const app = express();

app.get("/", (req, res) => {
    const userAgent = req.headers['user-agent']?.toLowerCase() || "";

    // كلمات تدل على أنه بوت جوجل
    if (
        userAgent.includes("googlebot") ||
        userAgent.includes("adsbot") ||
        userAgent.includes("crawler") ||
        userAgent.includes("spider") ||
        userAgent.includes("mediapartners")
    ) {
        // إعادة التوجيه إلى الصفحة النظيفة
        return res.redirect("https://treesaudia.wixstudio.com/website/blank-4");
    } else {
        // إعادة التوجيه إلى الصفحة الرمادية للبشر
        return res.redirect("https://treesaudia.wixstudio.com/website");
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Bridge running on port ${PORT}`));
