const products = [
{
name: "LED Lamp 10W",
price: 15
},
{
name: "Smart WiFi Lamp",
price: 40
}
];

function toggleMenu(){
const menu = document.getElementById("sideMenu");

if(!menu){
return;
}

menu.classList.toggle("active");
document.body.classList.toggle("menu-open");
}

function toggleChat(){
const chat = document.getElementById("chatWindow");
const overlay = document.getElementById("chatOverlay");

if(!chat || !overlay){
return;
}

const willOpen = !chat.classList.contains("active");

chat.classList.toggle("active", willOpen);
overlay.classList.toggle("active", willOpen);
document.body.classList.toggle("chat-open", willOpen);
chat.setAttribute("aria-hidden", String(!willOpen));
}

function closeChat(){
const chat = document.getElementById("chatWindow");
const overlay = document.getElementById("chatOverlay");

if(!chat || !overlay){
return;
}

chat.classList.remove("active");
overlay.classList.remove("active");
document.body.classList.remove("chat-open");
chat.setAttribute("aria-hidden", "true");
}

document.addEventListener("keydown", (event) => {
if(event.key === "Escape"){
closeChat();
}
});
