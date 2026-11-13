package api

import (
	_ "embed"
	"net/http"
)

// openAPISpec describes every endpoint, input, output and error code.
// docs_test.go checks it against the code, so it can't drift.
//
//go:embed openapi.json
var openAPISpec []byte

// swaggerUIVersion pins the Swagger UI release loaded from the CDN.
const swaggerUIVersion = "5.17.14"

// swaggerPage renders the OpenAPI description as an interactive page.
// Swagger UI's script and styles come from jsDelivr, so viewing the page
// needs internet access; the API itself does not.
const swaggerPage = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Calculator API</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@` + swaggerUIVersion + `/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@` + swaggerUIVersion + `/swagger-ui-bundle.js"></script>
    <script>
      window.ui = SwaggerUIBundle({ url: '/api/openapi.json', dom_id: '#swagger-ui' });
    </script>
  </body>
</html>
`

func handleOpenAPISpec(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(openAPISpec)
}

func handleDocs(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write([]byte(swaggerPage))
}
