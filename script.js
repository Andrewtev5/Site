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

menu.classList.toggle("active");

}

function toggleChat(){

const chat = document.getElementById("chatWindow");

chat.classList.toggle("active");

}