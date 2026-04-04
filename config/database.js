const mongoose = require("mongoose");

// Load environment variables (this is usually handled in index.js, 
// but we require it here to be safe or rely on the process)
require("dotenv").config();

const dbConnect = () => {
    mongoose.connect(process.env.DATABASE_URL)
    .then(() => {
        console.log("DB Connection is Successful");
    })
    .catch((error) => {
        console.log("Issue in DB Connection");
        console.error(error.message);
        // Exit the process with failure
        process.exit(1);
    });
};

module.exports = dbConnect;