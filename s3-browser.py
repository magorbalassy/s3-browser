import argparse
import boto3
import logging
import os

from flask import Flask, jsonify, g

logging.basicConfig(filename='s3-browser.log', level=logging.WARNING,
                    format='%(asctime)s - %(levelname)s - %(message)s',
                    datefmt='%m/%d/%Y %I:%M:%S %p')
logging.info('==== Starting new run ====')
    
app = Flask(__name__)

class S3Browser:
    
    bucket_name = ''
    
    def __init__(self, endpoint_url, access_key, secret_key):
        self.s3_resource = boto3.resource('s3', 
            endpoint_url=endpoint_url, 
            aws_access_key_id=access_key, 
            aws_secret_access_key=secret_key)

    def calculate_total_size(self):
        total_size = 0

        # List all objects in the S3 bucket
        bucket = self.s3_resource.Bucket(self.bucket_name)
        for obj in bucket.objects.all():
            total_size += obj.size

        return total_size

    def calculate_folder_size(self, folder_path):
        total_size = 0

        # List all objects in the specified folder
        bucket = self.s3_resource.Bucket(self.bucket_name)
        for obj in bucket.objects.filter(Prefix=folder_path):
            total_size += obj.size

        return total_size

class ArgumentParser:
    
    args = False
    
    def __init__(self):
        self.parser = argparse.ArgumentParser()
        self.parser.add_argument('--mode', '-m', choices=['standalone', 'ui'], help='Operating mode')
        self.parser.add_argument('--bucket_name', '-b', help='S3 bucket name')
        self.parser.add_argument('--access_key', '-k', help='AWS access key')
        self.parser.add_argument('--secret_key', '-s', help='AWS secret key')
        self.parser.add_argument('--endpoint','-e', help='S3 endpoint URL')
        self.parser.add_argument('--folder_path','-f', help='S3 folder path')

    def parse_args(self):
        args = self.parser.parse_args()

        # Check if the mode is set in the OS environment
        if os.environ.get('MODE') == 'standalone':
            args.mode = 'standalone'
        elif os.environ.get('MODE') == 'ui':
            args.mode = 'ui'
        elif not args.mode:
            self.parser.error('Mode must be specified')
        if args.mode == 'standalone':
            # Check if OS environment variables exist
            if 'BUCKET_NAME' in os.environ and 'ACCESS_KEY' in os.environ and 'SECRET_KEY' in os.environ and 'ENDPOINT' in os.environ:
                args.bucket_name = os.environ['BUCKET_NAME']
                args.access_key = os.environ['ACCESS_KEY']
                args.secret_key = os.environ['SECRET_KEY']
                args.endpoint = os.environ['ENDPOINT']
            if 'FOLDER_PATH' in os.environ:
                args.folder_path = os.environ.get('FOLDER_PATH')
            elif not args.folder_path:
                args.folder_path = '/'
            elif not args.bucket_name or not args.access_key or not args.secret_key or not args.endpoint:
                self.parser.error('In standalone mode, bucket_name, access_key, secret_key, endpoint and folder name must be specified')

        return args

def json_response(msg):
  response = jsonify(msg)
  response.headers.add('Access-Control-Allow-Origin', '*')
  response.headers.add('Access-Control-Allow-Headers', '*')
  response.headers.add('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  return response

@app.route('/', methods=['GET'])
def home():
    
    if not args.endpoint:
        return json_response('None')
    else:
        return json_response(str(args.mode))


if __name__ == "__main__":
    arg_parser = ArgumentParser()
    global args 
    args = arg_parser.parse_args()


    # Use the parsed arguments as needed
    # ...
    if args.mode == 'standalone':  
        s3_browser = S3Browser(args.endpoint, args.access_key, args.secret_key)
        s3_browser.bucket_name = args.bucket_name
        if args.folder_path == '/':
            print(s3_browser.calculate_total_size())
        else:
            print(s3_browser.calculate_folder_size(args.folder_path))
    if args.mode == 'ui':
        app.run(debug=True, host='0.0.0.0', port='5001')