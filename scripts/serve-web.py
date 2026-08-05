import argparse
import os
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class ExpoStaticHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        request_path = self.path.split("?", 1)[0]
        if request_path.startswith("/_expo/static/"):
            self.send_header("Cache-Control", "public, max-age=31536000, immutable")
        elif request_path.endswith(".html") or "." not in os.path.basename(request_path):
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self.send_header("Pragma", "no-cache")
            self.send_header("Expires", "0")
        super().end_headers()

    def send_head(self):
        translated_path = self.translate_path(self.path)
        if not os.path.exists(translated_path) and not translated_path.endswith(os.sep):
            html_path = f"{translated_path}.html"
            if os.path.isfile(html_path):
                original_path = self.path
                self.path = f"{self.path}.html"
                try:
                    return super().send_head()
                finally:
                    self.path = original_path

        return super().send_head()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--bind", default="0.0.0.0")
    parser.add_argument("--directory", required=True)
    parser.add_argument("--port", default=8081, type=int)
    args = parser.parse_args()

    handler = partial(ExpoStaticHandler, directory=args.directory)
    server = ThreadingHTTPServer((args.bind, args.port), handler)
    server.serve_forever()


if __name__ == "__main__":
    main()