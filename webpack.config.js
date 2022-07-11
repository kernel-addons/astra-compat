const path = require("path");
const {builtinModules} = require("module");
const {ESBuildMinifyPlugin} = require("esbuild-loader");
const {build, dependencies = {}} = require("./package.json");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");

module.exports = args => {
    const {context = "renderer"} = args;

    /**@type {import("webpack").Configuration} */
    const config = {
        entry: `./src/${context}/index`,
        devtool: build.sourcemap ? "eval-source-map" : false,
        output: {
            path: path.resolve(__dirname, "dist"),
            library: {
                type: context === "renderer" ? "module" : "commonjs"
            },
            filename: `${context}.js`
        },
        experiments: {
            outputModule: true
        },
        node: {
            __dirname: false
        },
        externals: Object.assign({electron: "electron"},
            Object.fromEntries(
                Object.keys(dependencies).concat(
                    builtinModules.flatMap(mod => [mod, `node:${mod}`])
                ).map(mod => [mod, mod])
            ),
        ),
        module: {
            rules: [
                {
                    test: /\.tsx?$/i,
                    exclude: /node_modules/i,
                    use: {
                        loader: "esbuild-loader",
                        options: {
                            loader: "tsx",
                            target: build.jsTarget ?? "es2022"
                        }
                    }
                },
                {
                    test: /\.jsx?$/i,
                    exclude: /node_modules/i,
                    use: {
                        loader: "esbuild-loader",
                        options: {
                            loader: "jsx",
                            target: build.jsTarget ?? "es2022"
                        }
                    }
                },
                {
                    test: /\.s[ac]ss$/i,
                    exclude: /node_modules/,
                    use: [
                        MiniCssExtractPlugin.loader,
                        {
                            loader: "css-loader",
                            options: {
                                importLoaders: true
                            }
                        },
                        "sass-loader"
                    ]
                }
            ]
        },
        resolve: {
            extensions: [".jsx", ".js", ".json", ".ts", ".tsx", ".scss", ".sass", ".css", ".svg"]
        },
        optimization: {
            minimizer: [
                (build.minifyJs || build.minifyCss) && new ESBuildMinifyPlugin({
                    target: build.jsTarget ?? "es2022",
                    css: build.minifyCss
                })
            ].filter(Boolean)
        },
        plugins: [
            new MiniCssExtractPlugin({
                filename: "style.css"
            })
        ]
    };

    return config;
};
