# Under development - doesn't work yet

# Plan
- have a cli tool (which has a Flask API as well) to query S3 endpoints (list content, get size of 'folders')
- have a UI (Angular / Typescript) which connects to the backend tool and display the S3 bucket content and can calculate size on-demand
- containerize the UI + backend to have it in one package and run it easily (Github Actions, nginx proxy)
