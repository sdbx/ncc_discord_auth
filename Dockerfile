FROM ksunhokim/node-auth3
WORKDIR /home
ADD . .
RUN npm install
RUN npm run build
CMD [\"npm\", \"run\", \"start\"]
