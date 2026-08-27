Indexing in MongoDB

Indexing is like know which word on which page 
You donot have to check every oage to find the word

SO without index You have to check every page until the word which you want to check will find May be that word is in the page numbew 700 so you check 700 the page one by one 
Now suppose We have 1000 user so every user search this word then every time database have to check the 700 pages to deliver that word

So if you observe it took so much time to deliever that word  and 

Technically the time taken is o(n)


Now to resolve this issue we have database index

What does it do?

Suppose now you have find the same word  which is in 700 page so with index the database know which page this word is Stored and it directly search that page and return you the word

It will not check every page one by one  so it reduces so much time to fetch that Data 

Now You can imagine if 1000 users is searching for same word with index and datbase know where this word is and it is very fast to deliver that Data 


Now we discuss the term call Collection Scaling

