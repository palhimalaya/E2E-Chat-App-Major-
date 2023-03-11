import { ArrowBackIcon } from "@chakra-ui/icons";
import {
  Box,
  FormControl,
  IconButton,
  Input,
  Spinner,
  Text,
  useToast,
} from "@chakra-ui/react";
import axios from "axios";
import React, { useCallback, useContext, useState } from "react";
import { useEffect } from "react";
import ProfileModal from "../components/miscellaneous/ProfileModel";
import { getSender, getSenderFull } from "../config/ChatLogics";
import { ChatContext } from "../Context/ChatProvider.js";
import UpdateGroupChatModal from "./miscellaneous/UpdateGroupChatModal";
import ScrollableChat from "./ScrollableChat";
import "./styles.css";
import io from "socket.io-client";
import Lottie from "react-lottie";
import animationData from "../animations/typing.json";

const ENDPOINT = "http://localhost:3001";
var socket;
const SingleChat = ({ fetchAgain, setFetchAgain }) => {
  const { user, selectedChat, setSelectedChat, notification, setNotification } =
    useContext(ChatContext);

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState();
  const [newMessage, setNewMessage] = useState("");
  const [socketConnected, setSocketConnected] = useState(false);
  const [typing, setTyping] = useState(false);
  const [isTyping, setIsTyping] = useState(false);

  const encryptMessage = async (privateKey) => {
    const array = JSON.parse(localStorage.getItem("othersPublicKey"));
    try {
      var matchingObject = array.find(function (obj) {
        return obj.chatId === selectedChat._id;
      });

      if (matchingObject) {
        var othersKey = matchingObject.publicKey;
      } else {
        console.log(`Object with name "${selectedChat._id}" not found`);
      }
    } catch (error) {}

    const postData = {
      message: newMessage,
      publicKey: othersKey,
      privateKey: privateKey,
    };

    const encryptedResult = await axios.post(
      "http://localhost:3001/api/key/encryptData",
      postData
    );

    return encryptedResult;
  };

  const decryptMessage = useCallback(
    async (content, signature, chatId) => {
      const keyPairJSON = localStorage.getItem("keyPair");

      const keyPair = JSON.parse(keyPairJSON);
      if (!keyPair) {
        console.log("No key pair found");
        localStorage.removeItem("userInfo");
      } else {
        var privateKey = keyPair.privateKey;
      }
      const othersPublicKey = JSON.parse(
        localStorage.getItem("othersPublicKey")
      );
      if (!othersPublicKey) {
        console.log("No public key found");
        return;
      } else {
        try {
          const publicData = othersPublicKey.find(
            (obj) => obj.chatId === chatId
          );
          var othersKey = publicData.publicKey;
          const postData = {
            message: content,
            privateKey: privateKey,
            publicKey: othersKey,
            signature: signature,
          };

          const { data } = await axios.post(
            "http://localhost:3001/api/key/decryptData",
            postData
          );
          if (data.status === 200) {
            return data.decryptedResult;
          } else {
            return "";
          }
        } catch (error) {
          console.log("Error while decrypting message: ", error);
          return "";
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedChat]
  );
  // const decryptMessage = async (m, signature) => {
  //   const keyPairJSON = localStorage.getItem("keyPair");

  //   const keyPair = JSON.parse(keyPairJSON);
  //   if (!keyPair) {
  //     console.log("No key pair found");
  //     localStorage.removeItem("userInfo");
  //   } else {
  //     var privateKey = keyPair.privateKey;
  //   }
  //   const othersPublicKey = JSON.parse(localStorage.getItem("othersPublicKey"));
  //   if (!othersPublicKey) {
  //     console.log("No public key found");
  //     return;
  //   } else {
  //     try {
  //       const publicData = othersPublicKey.find(
  //         (obj) => obj.chatId === selectedChat._id
  //       );
  //       var othersKey = publicData.publicKey;
  //       const postData = {
  //         message: m,
  //         privateKey: privateKey,
  //         publicKey: othersKey,
  //         signature: signature,
  //       };
  //       console.log(postData);

  //       const { data } = await axios.post(
  //         "http://localhost:3001/api/key/decryptData",
  //         postData
  //       );
  //       if (data.status === 200) {
  //         return data.decryptedResult;
  //       } else {
  //         return "";
  //       }
  //     } catch (error) {}
  //   }
  // };

  const defaultOptions = {
    loop: true,
    autoplay: true,
    animationData: animationData,
    rendererSettings: {
      preserveAspectRatio: "xMidYMid slice",
    },
  };
  const toast = useToast();

  useEffect(() => {
    let timeoutId;

    const joinChat = async () => {
      try {
        // Fetch the public key from local storage
        const keyPair = JSON.parse(localStorage.getItem("keyPair"));
        const publicKey = keyPair.publicKey;

        // Generate a random salt length between 6 to 10 characters
        const saltLength = Math.floor(Math.random() * 5) + 6;

        // Generate a random salt with the chosen length
        const salt = Math.random()
          .toString(36)
          .substring(2, saltLength + 2);

        // Generate a random position to insert the salt
        const saltPosition = Math.floor(Math.random() * publicKey.length);

        // Insert the salt at the random position
        const saltedPublicKey =
          publicKey.slice(0, saltPosition) +
          salt +
          publicKey.slice(saltPosition);

        // Store the salt in the database
        const config = {
          headers: { Authorization: `Bearer ${user.token}` },
        };
        await axios.post(
          "http://localhost:3001/api/salt/",
          {
            _id: selectedChat._id + user._id,
            salt: salt,
            position: saltPosition,
          },
          config
        );

        // Send the public key to the server
        const data = {
          room: selectedChat._id,
          publicKey: saltedPublicKey,
          userId: user._id,
        };
        socket.emit("join chat", data);

        // Load local messages
        const localMessages = JSON.parse(
          localStorage.getItem("localMessages") || "[]"
        );
        const filteredMessages = localMessages.filter(
          (message) => message.chat._id === selectedChat._id
        );
        setMessages(filteredMessages);
        setLoading(false);
      } catch (error) {
        console.log(error);
        setLoading(false);
      }
    };

    joinChat();

    // Clear the timeout if the component unmounts or the selected chat changes
    return () => {
      clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChat, socket]);

  const fetchMessages = async () => {
    if (!selectedChat) return;
    try {
      const config = {
        headers: {
          Authorization: `Bearer ${user.token}`,
        },
      };
      setLoading(true);
      await axios.get(
        `http://localhost:3001/api/message/${selectedChat._id}`,
        config
      );

      // setMessages(data);
      setLoading(false);
      // socket.emit("join chat", {
      //   room: selectedChat._id,
      //   publicKey: publicKey,
      // });
    } catch (error) {
      // toast({
      //   title: "Error Occurred! ",
      //   description: "Failed to fetch the Messages",
      //   status: "error",
      //   duration: 5000,
      //   isClosable: true,
      //   position: "bottom",
      // });
    }
  };

  const sendMessage = async (e) => {
    if (e.key === "Enter" && newMessage) {
      socket.emit("stop typing", selectedChat._id);
      const keyP = JSON.parse(localStorage.getItem("keyPair"));
      const privateKey = keyP.privateKey;
      const a = await encryptMessage(privateKey).then((res) => {
        return res;
      });

      const encryptedMessage = a.data.encryptedChunks;
      const signature = a.data.signedMessage;

      try {
        const config = {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${user.token}`,
          },
        };
        setNewMessage("");
        const { data } = await axios.post(
          "http://localhost:3001/api/message",
          {
            content: encryptedMessage,
            chatId: selectedChat._id,
          },
          config
        );
        //sending message from socket
        socket.emit("new message", { data, signature });

        const updatedMessageReceived = {
          ...data,
          content: newMessage,
          signature: signature,
        };
        //save updatedMessageReceived to local storage
        setMessages([...messages, updatedMessageReceived]);
        localStorage.setItem(
          "localMessages",
          JSON.stringify([...messages, updatedMessageReceived])
        );
      } catch (error) {
        toast({
          title: "Error Occurred! ",
          description: "Failed to send the Message or message is too large",
          status: "error",
          duration: 5000,
          isClosable: true,
          position: "bottom",
        });
      }
    }
  };

  useEffect(() => {
    socket = io(ENDPOINT);
    socket.emit("setup", user);
    socket.on("connected", () => setSocketConnected(true));
    socket.on("typing", () => setIsTyping(true));
    socket.on("stop typing", () => setIsTyping(false));
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    const getSalt = async (room, userId) => {
      const config = {
        headers: { Authorization: `Bearer ${user.token}` },
      };

      const saltData = await axios.get(
        `http://localhost:3001/api/salt/${room + userId}`,
        config
      );

      return saltData;
    };

    const saveData = async () => {
      fetchMessages();
      // fetchLocalMessages();
      // const selectedChatCompare = selectedChat;
      socket.on("public key", async ({ room, saltedPublicKey, userId }) => {
        const saltData = await getSalt(room, userId);

        const salt = saltData.data.salt;
        const saltPosition = saltData.data.position;
        // Remove the salt from the salted public key
        const desaltedPublicKey =
          saltedPublicKey.slice(0, saltPosition) +
          saltedPublicKey.slice(saltPosition + salt.length);

        let data = {
          chatId: room,
          publicKey: desaltedPublicKey,
        };

        try {
          var array = JSON.parse(localStorage.getItem("othersPublicKey"));
          var existingObject = array.find(function (obj) {
            return JSON.stringify(obj.chatId) === JSON.stringify(data.chatId);
          });

          if (!existingObject) {
            // If the object is not found, add it to the array
            console.log(room + " is not present in the array");
            array.push(data);
            localStorage.setItem("othersPublicKey", JSON.stringify(array));
          }
        } catch (error) {
          localStorage.setItem("othersPublicKey", JSON.stringify([data]));
        }
      });
    };

    saveData();

    // eslint-disable-next-line
  }, [selectedChat]);

  useEffect(() => {
    const handleMessageReceived = (data) => {
      const newMessageReceived = data.newMessageReceived;
      const signature = data.signature;

      console.log("Encrypted message received", newMessageReceived.content);
      console.log("signature received", signature);

      const selectedChatCompare =
        selectedChat && selectedChat._id === newMessageReceived.chat._id;

      const chatId = newMessageReceived.chat._id;

      decryptMessage(newMessageReceived.content, signature, chatId).then(
        (res) => {
          const data = {
            ...newMessageReceived,
            content: res,
          };

          if (!selectedChatCompare) {
            if (!notification.includes(data)) {
              setNotification((prev) => [...prev, data]);
              // save notification to localStorage
              setFetchAgain(!fetchAgain);
            }
            return;
          }

          setMessages((prevMessages) => {
            const newMessages = [...prevMessages, data];
            localStorage.setItem("localMessages", JSON.stringify(newMessages));
            return newMessages;
          });
        }
      );
    };

    socket.on("message received", handleMessageReceived);

    return () => {
      socket.off("message received", handleMessageReceived);
    };
    // add notificationRef and fetchAgain to the dependency array
    // eslint-disable-next-line
  }, [decryptMessage, selectedChat, fetchAgain]);

  const typingHandle = async (e) => {
    setNewMessage(e.target.value);

    if (!socketConnected) return;

    if (!typing) {
      setTyping(true);
      socket.emit("typing", selectedChat._id);
    }

    let lastTypingTime = new Date().getTime();
    var timerLength = 3000;
    setTimeout(() => {
      var timeNow = new Date().getTime();
      var timeDiff = timeNow - lastTypingTime;
      if (timeDiff >= timerLength && typing) {
        socket.emit("stop typing", selectedChat._id);
        setTyping(false);
      }
    }, timerLength);
  };
  return (
    <>
      {selectedChat ? (
        <>
          <Text
            fontSize={{ base: "28px", md: "30px" }}
            pb={3}
            px={2}
            w="100%"
            fontFamily="Work Sans"
            display={"flex"}
            justifyContent={{ base: "space-between" }}
            alignItems={"center"}
          >
            <IconButton
              display={{ base: "flex", md: "none" }}
              icon={<ArrowBackIcon />}
              onClick={() => setSelectedChat("")}
            />

            {!selectedChat.isGroupChat ? (
              <>
                {getSender(user, selectedChat.users)}
                <ProfileModal user={getSenderFull(user, selectedChat.users)} />
              </>
            ) : (
              <>
                {selectedChat.chatName.toUpperCase()}
                <UpdateGroupChatModal
                  fetchAgain={fetchAgain}
                  setFetchAgain={setFetchAgain}
                  fetchMessages={fetchMessages}
                />
              </>
            )}
          </Text>
          <Box
            display={"flex"}
            flexDirection={"column"}
            justifyContent={"flex-end"}
            p={3}
            bg={"#E8E8E8"}
            w={"100%"}
            h={"100%"}
            borderRadius="lg"
            overflowY={"hidden"}
          >
            {loading ? (
              <Spinner
                size={"xl"}
                w={20}
                h={20}
                alignSelf="center"
                margin={"auto"}
              />
            ) : (
              <div className="messages">
                <ScrollableChat messages={messages} />
              </div>
            )}
            <FormControl onKeyDown={sendMessage} isRequired mt={3}>
              {isTyping ? (
                <div>
                  <Lottie
                    options={defaultOptions}
                    width={70}
                    style={{ marginBottom: 15, marginLeft: 0 }}
                  />
                </div>
              ) : (
                <></>
              )}
              <Input
                variant={"filled"}
                bg="#E0E0E0"
                placeholder="Enter a message.."
                onChange={typingHandle}
                value={newMessage}
              />
              {/* <div className="image-upload">
                <input
                  id="file-input"
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                />
              </div> */}
            </FormControl>
          </Box>
        </>
      ) : (
        <Box
          display={"flex"}
          alignItems="center"
          justifyContent="center"
          height={"100%"}
        >
          <Text fontSize={"3XL"} pb={3} fontFamily="Work Sans">
            Click on a user to start chatting
          </Text>
        </Box>
      )}
    </>
  );
};

export default SingleChat;
