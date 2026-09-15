Use Google Analytics property 529569356 for every request. This selection guides requests; it does not enforce property isolation. Google account permissions determine which properties are accessible.
Only the Data API is authorized. The Admin API on `analyticsadmin.googleapis.com` is unreachable, and paths such as `/` or `/accounts` return 404: accounts, properties and data streams cannot be listed from here.
Every report is a POST carrying a JSON body. `runReport` has no GET form, and a POST with an empty body returns 400.
